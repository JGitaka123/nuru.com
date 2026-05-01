/**
 * B2C escrow release worker.
 *
 * Triggered by either:
 *   - Tenant confirms move-in via the API (immediate).
 *   - 7 days after Escrow → HELD with no dispute (scheduled job).
 *
 * The B2C security credential is loaded inside `releaseEscrow` and never
 * lives in the API service.
 */

import { Worker as BullWorker } from "bullmq";
import { releaseEscrow } from "../services/escrow-release";
import { logger } from "../lib/logger";
import { redis, type EscrowReleaseJob } from "./queues";

export function startEscrowReleaseWorker() {
  const worker = new BullWorker<EscrowReleaseJob>(
    "escrow-release",
    async (job) => {
      await releaseEscrow(job.data.escrowId);
    },
    {
      connection: redis,
      concurrency: 2,
    },
  );

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, escrowId: job?.data.escrowId, err }, "escrow release failed");
  });
  return worker;
}
