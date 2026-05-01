/**
 * Saved searches + alerts.
 *
 * A tenant defines a query ("2BR Kilimani under 60K with parking"); when a
 * new listing publishes that matches, we alert via push/SMS/email per the
 * tenant's preferences.
 *
 * Match path:
 *   1. Listing transitions to ACTIVE → enqueues SearchAlertJob{listingId}.
 *   2. The search-alert worker pulls saved searches that haven't matched
 *      yet (publishedAt > lastSeenAt) and tests structurally.
 *   3. Test passes → send alert + bump lastMatchAt + lastSeenAt.
 *
 * Structural matching only (no embedding) at first — fast, deterministic.
 * Vector matching is a future upgrade once we have enough match data to
 * tune the threshold.
 */

import { z } from "zod";
import { prisma } from "../db/client";
import { ConflictError, NotFoundError } from "../lib/errors";

export const SavedSearchInputSchema = z.object({
  name: z.string().min(2).max(100),
  query: z.string().max(500).optional(),
  neighborhoods: z.array(z.string()).max(10).default([]),
  bedroomsMin: z.number().int().min(0).max(10).optional(),
  bedroomsMax: z.number().int().min(0).max(10).optional(),
  rentMaxKesCents: z.number().int().min(0).max(100_000_000).optional(),
  rentMinKesCents: z.number().int().min(0).max(100_000_000).optional(),
  mustHave: z.array(z.string()).max(10).default([]),
  alertPush: z.boolean().default(true),
  alertSms: z.boolean().default(false),
  alertEmail: z.boolean().default(false),
});

export type SavedSearchInput = z.infer<typeof SavedSearchInputSchema>;

export async function createSavedSearch(userId: string, input: SavedSearchInput) {
  const data = SavedSearchInputSchema.parse(input);
  return prisma.savedSearch.create({
    data: {
      userId,
      ...data,
      lastSeenAt: new Date(),
    },
  });
}

export async function listSavedSearches(userId: string) {
  return prisma.savedSearch.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

export async function deleteSavedSearch(userId: string, id: string) {
  const ss = await prisma.savedSearch.findUnique({ where: { id } });
  if (!ss) throw new NotFoundError("SavedSearch");
  if (ss.userId !== userId) throw new ConflictError("Not your saved search");
  await prisma.savedSearch.delete({ where: { id } });
}

export async function setSavedSearchActive(userId: string, id: string, isActive: boolean) {
  const ss = await prisma.savedSearch.findUnique({ where: { id } });
  if (!ss) throw new NotFoundError("SavedSearch");
  if (ss.userId !== userId) throw new ConflictError("Not your saved search");
  return prisma.savedSearch.update({ where: { id }, data: { isActive } });
}

interface ListingRow {
  id: string;
  title: string;
  neighborhood: string;
  bedrooms: number;
  rentKesCents: number;
  features: string[];
  publishedAt: Date | null;
  primaryPhotoKey: string | null;
}

/** Test if a listing structurally matches a saved search. */
export function matches(ss: {
  neighborhoods: string[];
  bedroomsMin: number | null;
  bedroomsMax: number | null;
  rentMaxKesCents: number | null;
  rentMinKesCents: number | null;
  mustHave: string[];
}, listing: ListingRow): boolean {
  if (ss.neighborhoods.length > 0 && !ss.neighborhoods.includes(listing.neighborhood)) return false;
  if (ss.bedroomsMin !== null && listing.bedrooms < ss.bedroomsMin) return false;
  if (ss.bedroomsMax !== null && listing.bedrooms > ss.bedroomsMax) return false;
  if (ss.rentMaxKesCents !== null && listing.rentKesCents > ss.rentMaxKesCents) return false;
  if (ss.rentMinKesCents !== null && listing.rentKesCents < ss.rentMinKesCents) return false;
  if (ss.mustHave.length > 0) {
    const features = new Set(listing.features);
    for (const f of ss.mustHave) if (!features.has(f)) return false;
  }
  return true;
}
