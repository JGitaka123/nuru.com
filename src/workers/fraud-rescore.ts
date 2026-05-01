/**
 * Fraud rescore worker.
 *
 * Triggered by:
 *   - User reports a listing → enqueued from src/services/fraud-reports.ts
 *   - Nightly cron (TODO: add schedule) → null listingId means "all stale"
 *
 * For batch rescores, prefer the Anthropic Batch API (50% off) — see
 * src/ai/router.ts:RunOptions.batch. We don't yet wire the async polling
 * path; for now the batch flag is documented but the rescore worker
 * processes one listing at a time. Move to async batch when daily rescore
 * volume exceeds ~500 listings.
 */

import { Worker as BullWorker } from "bullmq";
import { prisma } from "../db/client";
import { logger } from "../lib/logger";
import { scoreFraud } from "../prompts/fraud-scorer";
import { redis, type FraudRescoreJob } from "./queues";

export function startFraudRescoreWorker() {
  const worker = new BullWorker<FraudRescoreJob>(
    "fraud-rescore",
    async (job) => {
      const ids = job.data.listingId
        ? [job.data.listingId]
        : (await prisma.listing.findMany({
            where: { status: { in: ["ACTIVE", "PENDING_REVIEW"] } },
            select: { id: true },
            take: 200,
          })).map((l) => l.id);

      for (const id of ids) {
        await rescoreOne(id).catch((e) => logger.error({ err: e, listingId: id }, "rescore failed"));
      }
    },
    { connection: redis, concurrency: 1 },
  );

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err }, "fraud-rescore failed");
  });
  return worker;
}

async function rescoreOne(listingId: string) {
  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    include: { agent: { include: { agentProfile: true } } },
  });
  if (!listing) return;

  const [reports, viewings, inquiries] = await Promise.all([
    prisma.fraudReport.count({ where: { listingId, resolvedAt: null } }),
    prisma.viewing.findMany({ where: { listingId } }),
    prisma.inquiry.count({ where: { listingId } }),
  ]);

  const fraud = await scoreFraud({
    listingId,
    agentTrustScore: listing.agent.agentProfile?.trustScore ?? 50,
    agentAccountAgeDays: Math.floor((Date.now() - listing.agent.createdAt.getTime()) / 86_400_000),
    agentVerified: listing.agent.verificationStatus === "VERIFIED",
    rentVsMarketMedianRatio: 1, // TODO: compute from RentComp
    photoCount: listing.photoKeys.length,
    hasWatermark: listing.fraudFlags.includes("watermark_detected"),
    reverseImageMatches: 0,
    duplicateOfActiveListings: 0,
    descriptionLength: listing.description.length,
    hasContactInDescription: /\+?254\d{9}/.test(listing.description),
    daysSinceCreated: Math.floor((Date.now() - listing.createdAt.getTime()) / 86_400_000),
    inquiriesCount: inquiries,
    viewingsBookedCount: viewings.length,
    viewingsCompletedCount: viewings.filter((v) => v.status === "COMPLETED").length,
    reportsCount: reports,
  }, { actorId: listing.agentId });

  await prisma.listing.update({
    where: { id: listingId },
    data: {
      fraudScore: fraud.content.score,
      fraudFlags: fraud.content.flags,
      // Auto-hide if recommendation is hide/remove. Admin can revive.
      ...(fraud.content.recommendation === "hide" || fraud.content.recommendation === "remove"
        ? { status: "PENDING_REVIEW" as const }
        : {}),
    },
  });
  logger.info(
    { listingId, score: fraud.content.score, recommendation: fraud.content.recommendation },
    "rescored",
  );
}
