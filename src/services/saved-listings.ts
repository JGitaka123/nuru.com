/**
 * Tenant favorites / saved listings.
 *
 * One row per (userId, listingId). Tenants can save while browsing for
 * later viewing; agents can see anonymized aggregate save-counts on their
 * listings as a leading indicator of demand.
 */

import { z } from "zod";
import { prisma } from "../db/client";
import { NotFoundError } from "../lib/errors";
import { recordEvent } from "./events";

export const SaveSchema = z.object({
  listingId: z.string().min(1),
  notes: z.string().max(1000).optional(),
});

export async function saveListing(userId: string, input: z.infer<typeof SaveSchema>) {
  const data = SaveSchema.parse(input);
  const listing = await prisma.listing.findUnique({ where: { id: data.listingId } });
  if (!listing) throw new NotFoundError("Listing");

  const saved = await prisma.savedListing.upsert({
    where: { userId_listingId: { userId, listingId: data.listingId } },
    create: { userId, listingId: data.listingId, notes: data.notes },
    update: { notes: data.notes },
  });
  recordEvent({
    type: "saved_listing",
    actorId: userId,
    actorRole: "TENANT",
    targetType: "listing",
    targetId: data.listingId,
  });
  return saved;
}

export async function unsaveListing(userId: string, listingId: string) {
  await prisma.savedListing.deleteMany({
    where: { userId, listingId },
  });
}

export async function listSaved(userId: string) {
  return prisma.savedListing.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: {
      listing: {
        select: {
          id: true, title: true, neighborhood: true, bedrooms: true,
          rentKesCents: true, primaryPhotoKey: true, status: true,
        },
      },
    },
    take: 100,
  });
}

export async function isSaved(userId: string, listingId: string): Promise<boolean> {
  const row = await prisma.savedListing.findUnique({
    where: { userId_listingId: { userId, listingId } },
  });
  return row !== null;
}

/** Aggregate save count for a listing — helps agents see early interest. */
export async function saveCount(listingId: string): Promise<number> {
  return prisma.savedListing.count({ where: { listingId } });
}
