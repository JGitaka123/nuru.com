/**
 * Listing enrichment worker.
 *
 * Pipeline (per job):
 *   1. Load listing + photo R2 keys.
 *   2. Vision call (Sonnet) → title, description, features, price band, quality issues.
 *   3. Embed (self-hosted bge-m3) the title+description for semantic search.
 *   4. Initial fraud score (Sonnet) on signals available so far.
 *   5. Persist; transition listing to PENDING_REVIEW if quality is OK.
 *
 * Failures: BullMQ retries with exponential backoff. After 5 failures,
 * job is dead-lettered to the failed-listings queue (set up later).
 */

import type { Worker } from "bullmq";
import { Worker as BullWorker } from "bullmq";
import { prisma } from "../db/client";
import { logger } from "../lib/logger";
import { publicUrlFor } from "../lib/r2";
import { generateListing } from "../prompts/listing-generator";
import { scoreFraud } from "../prompts/fraud-scorer";
import { embed } from "../services/inference";
import { redis, type ListingEnrichmentJob } from "./queues";

export function startListingEnrichmentWorker(): Worker<ListingEnrichmentJob> {
  const worker = new BullWorker<ListingEnrichmentJob>(
    "listing-enrichment",
    async (job) => {
      const { listingId } = job.data;
      const listing = await prisma.listing.findUnique({ where: { id: listingId } });
      if (!listing) throw new Error(`Listing not found: ${listingId}`);
      if (listing.photoKeys.length === 0) {
        logger.warn({ listingId }, "no photos to enrich; skipping");
        return;
      }

      const photoUrls = listing.photoKeys.map(publicUrlFor);
      const draft = await generateListing({
        photoUrls,
        neighborhood: listing.neighborhood,
        agentHint: listing.title,
        meta: { actorId: listing.agentId, targetId: listing.id },
      });

      const embedding = await embed(`${draft.content.title}. ${draft.content.description}`);

      // Initial fraud score with the signals we have right now.
      const agent = await prisma.user.findUniqueOrThrow({
        where: { id: listing.agentId },
        include: { agentProfile: true },
      });
      const fraud = await scoreFraud({
        listingId: listing.id,
        agentTrustScore: agent.agentProfile?.trustScore ?? 50,
        agentAccountAgeDays: Math.floor((Date.now() - agent.createdAt.getTime()) / 86_400_000),
        agentVerified: agent.verificationStatus === "VERIFIED",
        rentVsMarketMedianRatio: 1, // unknown at this point
        photoCount: listing.photoKeys.length,
        hasWatermark: draft.content.qualityIssues.includes("watermark_detected"),
        reverseImageMatches: 0,
        duplicateOfActiveListings: 0,
        descriptionLength: draft.content.description.length,
        hasContactInDescription: /\+?254\d{9}/.test(draft.content.description),
        daysSinceCreated: 0,
        inquiriesCount: 0,
        viewingsBookedCount: 0,
        viewingsCompletedCount: 0,
        reportsCount: 0,
      }, { actorId: listing.agentId });

      await prisma.listing.update({
        where: { id: listingId },
        data: {
          // Only auto-fill empty/short fields — never overwrite agent's words.
          ...(listing.title.length < 10 ? { title: draft.content.title } : {}),
          ...(listing.description.length < 40 ? { description: draft.content.description } : {}),
          aiGenerated: true,
          aiQualityScore: draft.content.confidence,
          aiPriceLow: draft.content.estimatedRentKesLow * 100,
          aiPriceHigh: draft.content.estimatedRentKesHigh * 100,
          fraudScore: fraud.content.score,
          fraudFlags: fraud.content.flags,
          embedding: embedding as unknown as undefined, // pgvector via raw SQL elsewhere
        },
      });

      // Embedding goes through raw SQL because Prisma's vector column is Unsupported.
      await prisma.$executeRawUnsafe(
        `UPDATE "Listing" SET embedding = $1::vector WHERE id = $2`,
        `[${embedding.join(",")}]`,
        listingId,
      );

      logger.info(
        { listingId, fraudScore: fraud.content.score, qualityIssues: draft.content.qualityIssues },
        "listing enriched",
      );
    },
    {
      connection: redis,
      concurrency: 4,
    },
  );

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err }, "listing enrichment failed");
  });
  return worker;
}
