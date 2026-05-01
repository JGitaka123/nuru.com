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
import { recordEvent } from "./events";

export const ListingInputSchema = z.object({
  title: z.string().min(5).max(120),
  description: z.string().min(40).max(2000),
  category: z.enum([
    "BEDSITTER", "STUDIO", "ONE_BR", "TWO_BR", "THREE_BR",
    "FOUR_PLUS_BR", "MAISONETTE", "TOWNHOUSE",
  ]),
  bedrooms: z.number().int().min(0).max(10),
  bathrooms: z.number().int().min(1).max(10),
  rentKesCents: z.number().int().min(500_000).max(100_000_000), // 5K-1M KES per month
  depositMonths: z.number().int().min(0).max(6).default(2),
  serviceChargeKesCents: z.number().int().min(0).default(0),
  features: z.array(z.string()).default([]),
  neighborhood: z.string().min(2).max(80),
  estate: z.string().max(80).optional(),
  addressLine: z.string().max(200).optional(),
  photoKeys: z.array(z.string()).default([]),
  primaryPhotoKey: z.string().optional(),
});

export type ListingInput = z.infer<typeof ListingInputSchema>;

export const ListingPatchSchema = ListingInputSchema.partial();
export type ListingPatch = z.infer<typeof ListingPatchSchema>;

export async function createListing(agentId: string, input: ListingInput) {
  const data = ListingInputSchema.parse(input);
  return prisma.listing.create({
    data: {
      ...data,
      agentId,
      status: "DRAFT",
    },
  });
}

export async function getListing(id: string) {
  const listing = await prisma.listing.findUnique({
    where: { id },
    include: {
      agent: { select: { id: true, name: true, phoneE164: true, agentProfile: true, verificationStatus: true } },
    },
  });
  if (!listing) throw new NotFoundError("Listing");
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
  await assertCanEdit(listingId, userId, role);
  const data = ListingPatchSchema.parse(patch);
  return prisma.listing.update({ where: { id: listingId }, data });
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
  category?: ListingCategory;
  bedroomsMin?: number;
  rentMaxKesCents?: number;
  cursor?: string;
  limit?: number;
}

export async function listPublicListings(filters: PublicListingFilters) {
  const limit = Math.min(filters.limit ?? 20, 50);
  return prisma.listing.findMany({
    where: {
      status: "ACTIVE",
      fraudScore: { lt: 60 },
      ...(filters.neighborhood ? { neighborhood: filters.neighborhood } : {}),
      ...(filters.category ? { category: filters.category } : {}),
      ...(filters.bedroomsMin !== undefined ? { bedrooms: { gte: filters.bedroomsMin } } : {}),
      ...(filters.rentMaxKesCents !== undefined ? { rentKesCents: { lte: filters.rentMaxKesCents } } : {}),
    },
    orderBy: { publishedAt: "desc" },
    take: limit + 1,
    ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
    select: {
      id: true, title: true, neighborhood: true, estate: true, bedrooms: true,
      bathrooms: true, category: true, rentKesCents: true, depositMonths: true,
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
