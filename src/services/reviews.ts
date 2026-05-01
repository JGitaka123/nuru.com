/**
 * Reviews — listings, agents, tenants. 1-5 star + optional body.
 *
 * Verified review = author was a party to the underlying lease/viewing.
 * One review per (kind, target, author) — re-submissions update.
 */

import { z } from "zod";
import type { ReviewKind } from "@prisma/client";
import { prisma } from "../db/client";
import { ConflictError, NotFoundError, ValidationError } from "../lib/errors";

export const ReviewInputSchema = z.object({
  kind: z.enum(["LISTING", "AGENT", "TENANT"]),
  targetUserId: z.string().optional(),
  targetListingId: z.string().optional(),
  rating: z.number().int().min(1).max(5),
  body: z.string().max(2000).optional(),
});

export async function submitReview(authorId: string, input: z.infer<typeof ReviewInputSchema>) {
  const data = ReviewInputSchema.parse(input);

  if (data.kind === "LISTING" && !data.targetListingId) throw new ValidationError("targetListingId required");
  if ((data.kind === "AGENT" || data.kind === "TENANT") && !data.targetUserId) {
    throw new ValidationError("targetUserId required");
  }
  if (data.kind === "AGENT" && data.targetUserId === authorId) throw new ConflictError("Cannot review yourself");

  const verified = await isVerifiedRelationship(authorId, data);

  const existing = await prisma.review.findFirst({
    where: {
      authorId,
      kind: data.kind,
      ...(data.targetUserId ? { targetUserId: data.targetUserId } : {}),
      ...(data.targetListingId ? { targetListingId: data.targetListingId } : {}),
    },
  });
  if (existing) {
    return prisma.review.update({
      where: { id: existing.id },
      data: { rating: data.rating, body: data.body, verified },
    });
  }
  return prisma.review.create({
    data: {
      kind: data.kind,
      authorId,
      targetUserId: data.targetUserId ?? null,
      targetListingId: data.targetListingId ?? null,
      rating: data.rating,
      body: data.body,
      verified,
    },
  });
}

async function isVerifiedRelationship(authorId: string, data: z.infer<typeof ReviewInputSchema>): Promise<boolean> {
  if (data.kind === "AGENT" && data.targetUserId) {
    // Author rented from this agent OR booked a viewing of their listing.
    const lease = await prisma.lease.findFirst({
      where: { tenantId: authorId, listing: { agentId: data.targetUserId } },
    });
    if (lease) return true;
    const viewing = await prisma.viewing.findFirst({
      where: { tenantId: authorId, listing: { agentId: data.targetUserId }, status: "COMPLETED" },
    });
    return !!viewing;
  }
  if (data.kind === "TENANT" && data.targetUserId) {
    // Author is the agent/landlord of a lease where targetUser was tenant.
    const lease = await prisma.lease.findFirst({
      where: { tenantId: data.targetUserId, listing: { agentId: authorId } },
    });
    return !!lease;
  }
  if (data.kind === "LISTING" && data.targetListingId) {
    const viewing = await prisma.viewing.findFirst({
      where: { tenantId: authorId, listingId: data.targetListingId, status: "COMPLETED" },
    });
    return !!viewing;
  }
  return false;
}

export async function listForListing(listingId: string) {
  return prisma.review.findMany({
    where: { kind: "LISTING", targetListingId: listingId, hidden: false },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

export async function listForUser(targetUserId: string, kind: ReviewKind) {
  return prisma.review.findMany({
    where: { kind, targetUserId, hidden: false },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

export async function summary(opts: { kind: ReviewKind; targetUserId?: string; targetListingId?: string }) {
  const rows = await prisma.review.aggregate({
    where: {
      kind: opts.kind,
      hidden: false,
      ...(opts.targetUserId ? { targetUserId: opts.targetUserId } : {}),
      ...(opts.targetListingId ? { targetListingId: opts.targetListingId } : {}),
    },
    _avg: { rating: true },
    _count: { _all: true },
  });
  return {
    avg: rows._avg.rating ?? null,
    count: rows._count._all,
  };
}

export async function hideReview(id: string, _adminId: string) {
  const r = await prisma.review.findUnique({ where: { id } });
  if (!r) throw new NotFoundError("Review");
  return prisma.review.update({ where: { id }, data: { hidden: true } });
}
