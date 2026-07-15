/**
 * Listing service — CRUD plus the AI enrichment trigger.
 *
 * State machine:
 *   DRAFT → PENDING_REVIEW (auto-set when agent hits "publish")
 *   PENDING_REVIEW → ACTIVE (after fraud score lands < 60 and admin/auto-approves)
 *   ACTIVE ↔ PAUSED (agent toggle)
 *   ACTIVE → RENTED (set by escrow handler when deposit lands)
 *   any → REMOVED (admin/agent)
 *
 * Authorization: an agent can only mutate listings where agentId == userId.
 * Admins can override.
 */

import { z } from "zod";
import type { ListingCategory, ListingStatus, UserRole } from "@prisma/client";
import { prisma } from "../db/client";
import { ForbiddenError, NotFoundError, ValidationError } from "../lib/errors";
import { logger } from "../lib/logger";
import { canonicalCounty, countyForArea } from "../lib/locations";
import { recordEvent } from "./events";

// Base field shapes, unrefined — the patch schema derives from this.
const ListingFields = z.object({
  title: z.string().min(5).max(120),
  description: z.string().min(40).max(2000),
  category: z.enum([
    "BEDSITTER", "STUDIO", "ONE_BR", "TWO_BR", "THREE_BR",
    "FOUR_PLUS_BR", "MAISONETTE", "TOWNHOUSE",
  ]),
  listingType: z.enum(["RENT", "SALE"]).default("RENT"),
  bedrooms: z.number().int().min(0).max(10),
  bathrooms: z.number().int().min(1).max(10),
  // For RENT this is the monthly rent; for SALE it's unused (defaults to 0
  // so downstream rent-based analytics stay numeric). Validated below.
  rentKesCents: z.number().int().min(0).max(100_000_000).default(0),
  // Asking price for SALE listings, in whole KES (50K up to 2B KES).
  salePriceKes: z.number().int().min(50_000).max(2_000_000_000).optional(),
  depositMonths: z.number().int().min(0).max(6).default(2),
  serviceChargeKesCents: z.number().int().min(0).default(0),
  features: z.array(z.string()).default([]),
  neighborhood: z.string().min(2).max(80),
  // County groups the listing nationally. Optional on input — derived from the
  // neighborhood when the agent doesn't pick one (see resolveCounty).
  county: z.string().min(2).max(60).optional(),
  estate: z.string().max(80).optional(),
  addressLine: z.string().max(200).optional(),
  photoKeys: z.array(z.string()).default([]),
  primaryPhotoKey: z.string().optional(),
  // Map pin. Kenya bounding box; stored in the PostGIS location column.
  lat: z.number().min(-4.9).max(5.1).optional(),
  lng: z.number().min(33.9).max(41.9).optional(),
});

// A RENT listing needs a real monthly rent; a SALE listing needs an asking price.
export const ListingInputSchema = ListingFields.refine(
  (v) => (v.listingType === "SALE" ? v.salePriceKes !== undefined : v.rentKesCents >= 500_000),
  { message: "RENT needs rentKesCents ≥ 5000 KES; SALE needs salePriceKes", path: ["rentKesCents"] },
);

export type ListingInput = z.infer<typeof ListingInputSchema>;

export const ListingPatchSchema = ListingFields.partial();
export type ListingPatch = z.infer<typeof ListingPatchSchema>;

/**
 * Resolve the county to store: prefer an explicit (canonicalised) county,
 * else derive one from the free-text neighborhood. Returns undefined when we
 * can't confidently map it — the listing still saves, just ungrouped.
 */
function resolveCounty(county: string | undefined, neighborhood: string): string | undefined {
  if (county) return canonicalCounty(county) ?? county;
  return countyForArea(neighborhood) ?? undefined;
}

export async function createListing(agentId: string, input: ListingInput) {
  const { lat, lng, ...data } = ListingInputSchema.parse(input);
  const listing = await prisma.listing.create({
    data: {
      ...data,
      county: resolveCounty(data.county, data.neighborhood),
      agentId,
      status: "DRAFT",
    },
  });
  if (lat !== undefined && lng !== undefined) {
    await setListingLocation(listing.id, lat, lng);
  }
  return listing;
}

/** location is Unsupported("geography") in Prisma, so writes go through SQL. */
async function setListingLocation(listingId: string, lat: number, lng: number) {
  await prisma.$executeRaw`
    UPDATE "Listing"
    SET location = ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
    WHERE id = ${listingId}`;
}

export interface ListingCoords {
  lat: number | null;
  lng: number | null;
}

export async function getListingCoords(listingId: string): Promise<ListingCoords> {
  const rows = await prisma.$queryRaw<Array<{ lat: number | null; lng: number | null }>>`
    SELECT ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng
    FROM "Listing" WHERE id = ${listingId}`;
  return rows[0] ?? { lat: null, lng: null };
}

export async function getListing(id: string, viewer?: { sub: string; role: UserRole }) {
  const listing = await prisma.listing.findUnique({
    where: { id },
    include: {
      agent: { select: { id: true, name: true, phoneE164: true, agentProfile: true, verificationStatus: true } },
    },
  });
  if (!listing) throw new NotFoundError("Listing");
  const canViewPrivate = viewer && (viewer.role === "ADMIN" || listing.agentId === viewer.sub);
  if (!canViewPrivate && (listing.status !== "ACTIVE" || listing.fraudScore >= 60)) {
    throw new NotFoundError("Listing");
  }
  return listing;
}

async function assertCanEdit(listingId: string, userId: string, role: UserRole) {
  const listing = await prisma.listing.findUnique({ where: { id: listingId } });
  if (!listing) throw new NotFoundError("Listing");
  if (listing.agentId !== userId && role !== "ADMIN") {
    throw new ForbiddenError("Not your listing");
  }
  return listing;
}

export async function updateListing(
  listingId: string,
  userId: string,
  role: UserRole,
  patch: ListingPatch,
) {
  const existing = await assertCanEdit(listingId, userId, role);
  const { lat, lng, ...data } = ListingPatchSchema.parse(patch);
  // Keep county consistent when the county or neighborhood changes.
  if (data.county !== undefined || data.neighborhood !== undefined) {
    data.county = resolveCounty(data.county, data.neighborhood ?? existing.neighborhood);
  }
  const updated = await prisma.listing.update({ where: { id: listingId }, data });
  if (lat !== undefined && lng !== undefined) {
    await setListingLocation(listingId, lat, lng);
  }
  return updated;
}

const ALLOWED_TRANSITIONS: Record<ListingStatus, ListingStatus[]> = {
  DRAFT: ["PENDING_REVIEW", "REMOVED"],
  PENDING_REVIEW: ["ACTIVE", "DRAFT", "REMOVED"],
  ACTIVE: ["PAUSED", "REMOVED", "RENTED"],
  PAUSED: ["ACTIVE", "REMOVED"],
  RENTED: ["ACTIVE", "REMOVED"],
  REMOVED: [],
};

export async function transitionListing(
  listingId: string,
  userId: string,
  role: UserRole,
  to: ListingStatus,
) {
  const listing = await assertCanEdit(listingId, userId, role);
  const allowed = ALLOWED_TRANSITIONS[listing.status];
  if (!allowed.includes(to)) {
    throw new ValidationError(`Cannot move ${listing.status} → ${to}`);
  }

  // Block ACTIVE if fraud score is high (admin bypass via role check above).
  if (to === "ACTIVE" && role !== "ADMIN" && listing.fraudScore >= 60) {
    throw new ForbiddenError(`Listing fraud score ${listing.fraudScore} is too high to publish`);
  }

  const updated = await prisma.listing.update({
    where: { id: listingId },
    data: {
      status: to,
      ...(to === "ACTIVE" && !listing.publishedAt ? { publishedAt: new Date() } : {}),
    },
  });

  if (to === "ACTIVE" && !listing.publishedAt) {
    recordEvent({
      type: "listing_published",
      actorId: userId,
      actorRole: role,
      targetType: "listing",
      targetId: listingId,
    });
    // Fan out to saved-search alerts.
    const { searchAlertQueue } = await import("../workers/queues.js");
    await searchAlertQueue.add(
      "match",
      { listingId },
      { jobId: `alert:${listingId}` },
    ).catch(() => undefined);
  }
  return updated;
}

export async function listMyListings(agentId: string, status?: ListingStatus) {
  return prisma.listing.findMany({
    where: { agentId, ...(status ? { status } : {}) },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });
}

export interface PublicListingFilters {
  neighborhood?: string;
  county?: string;
  category?: ListingCategory;
  listingType?: "RENT" | "SALE";
  bedroomsMin?: number;
  rentMaxKesCents?: number;
  salePriceMaxKes?: number;
  cursor?: string;
  limit?: number;
}

export async function listPublicListings(filters: PublicListingFilters) {
  const limit = Math.min(filters.limit ?? 20, 50);
  // A free-text location can be an area OR a county name — match either so
  // "Nakuru" surfaces listings whose neighborhood is an area within Nakuru.
  const locationWhere = filters.neighborhood
    ? {
        OR: [
          { neighborhood: { equals: filters.neighborhood, mode: "insensitive" as const } },
          { county: { equals: filters.neighborhood, mode: "insensitive" as const } },
        ],
      }
    : {};
  return prisma.listing.findMany({
    where: {
      status: "ACTIVE",
      fraudScore: { lt: 60 },
      ...locationWhere,
      ...(filters.county ? { county: { equals: filters.county, mode: "insensitive" } } : {}),
      ...(filters.category ? { category: filters.category } : {}),
      listingType: filters.listingType ?? "RENT",
      ...(filters.bedroomsMin !== undefined ? { bedrooms: { gte: filters.bedroomsMin } } : {}),
      ...(filters.rentMaxKesCents !== undefined ? { rentKesCents: { lte: filters.rentMaxKesCents } } : {}),
      ...(filters.salePriceMaxKes !== undefined ? { salePriceKes: { lte: filters.salePriceMaxKes } } : {}),
    },
    orderBy: { publishedAt: "desc" },
    take: limit + 1,
    ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
    select: {
      id: true, title: true, neighborhood: true, county: true, estate: true, bedrooms: true,
      bathrooms: true, category: true, listingType: true, rentKesCents: true,
      salePriceKes: true, depositMonths: true,
      features: true, primaryPhotoKey: true, photoKeys: true,
      verificationStatus: true, publishedAt: true, fraudScore: true,
    },
  }).then((results) => {
    const hasMore = results.length > limit;
    const items = hasMore ? results.slice(0, limit) : results;
    return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
  });
}

export async function attachPhotos(listingId: string, userId: string, role: UserRole, keys: string[]) {
  const listing = await assertCanEdit(listingId, userId, role);
  const existing = new Set(listing.photoKeys);
  for (const k of keys) existing.add(k);
  const photoKeys = Array.from(existing);
  const primary = listing.primaryPhotoKey ?? photoKeys[0] ?? null;

  const updated = await prisma.listing.update({
    where: { id: listingId },
    data: { photoKeys, primaryPhotoKey: primary },
  });
  logger.info({ listingId, added: keys.length }, "photos attached");
  return updated;
}
