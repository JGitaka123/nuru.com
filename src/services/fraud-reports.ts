/**
 * Fraud reports — users flag suspicious listings or behavior.
 *
 * One open report per (listingId, reporterId) — re-reporting updates the
 * existing row. Reports auto-rescore the target listing's fraud signal
 * (+1 to reportsCount in scoreFraud signals). Multiple reports for the
 * same listing trigger an admin review queue.
 */

import { z } from "zod";
import { prisma } from "../db/client";
import { ConflictError, NotFoundError, ValidationError } from "../lib/errors";
import { fraudRescoreQueue } from "../workers/queues";
import { logger } from "../lib/logger";

export const ReportSchema = z.object({
  listingId: z.string().min(1),
  reason: z.enum([
    "fake_listing",
    "stolen_photos",
    "viewing_fee_demand",
    "bait_pricing",
    "off_platform_payment",
    "harassment",
    "other",
  ]),
  details: z.string().max(2000).optional(),
});

export async function submitReport(reporterId: string, input: z.infer<typeof ReportSchema>) {
  const data = ReportSchema.parse(input);

  const listing = await prisma.listing.findUnique({ where: { id: data.listingId } });
  if (!listing) throw new NotFoundError("Listing");
  if (listing.agentId === reporterId) {
    throw new ValidationError("You can't report your own listing");
  }

  const existing = await prisma.fraudReport.findFirst({
    where: { listingId: data.listingId, reporterId, resolvedAt: null },
  });
  if (existing) {
    return prisma.fraudReport.update({
      where: { id: existing.id },
      data: { reason: data.reason, details: data.details },
    });
  }

  const report = await prisma.fraudReport.create({
    data: {
      listingId: data.listingId,
      reporterId,
      reason: data.reason,
      details: data.details,
    },
  });

  // Trigger a rescore so the listing gets re-evaluated with the new signal.
  await fraudRescoreQueue.add(
    "rescore",
    { listingId: data.listingId },
    { jobId: `rescore-${data.listingId}-${Date.now()}` },
  ).catch((e) => logger.warn({ err: e }, "could not enqueue rescore"));

  return report;
}

export async function listOpenReports(limit = 50) {
  return prisma.fraudReport.findMany({
    where: { resolvedAt: null },
    orderBy: { createdAt: "desc" },
    include: {
      listing: { select: { id: true, title: true, agentId: true, fraudScore: true } },
      reporter: { select: { id: true, name: true, phoneE164: true } },
    },
    take: limit,
  });
}

export async function resolveReport(id: string, adminId: string) {
  const report = await prisma.fraudReport.findUnique({ where: { id } });
  if (!report) throw new NotFoundError("FraudReport");
  if (report.resolvedAt) throw new ConflictError("Already resolved");
  return prisma.fraudReport.update({
    where: { id },
    data: { resolvedAt: new Date(), details: report.details ? `${report.details}\n[resolved by ${adminId}]` : `[resolved by ${adminId}]` },
  });
}
