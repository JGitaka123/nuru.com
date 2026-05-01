/**
 * Event processor — drains the events queue into the Event table.
 *
 * Single worker, batched inserts (50 at a time) to keep DB write load
 * low. BullMQ delivers one-at-a-time; we batch in-process via a small
 * accumulator with a 1-second flush interval.
 */

import { Worker as BullWorker, type Job } from "bullmq";
import { prisma } from "../db/client";
import { logger } from "../lib/logger";
import { redis, type EventJob } from "./queues";

interface PendingRow {
  type: string;
  actorId: string | null;
  actorRole: string | null;
  targetType: string | null;
  targetId: string | null;
  properties: object | null;
  variantKey: string | null;
  sessionId: string | null;
  ipHash: string | null;
  userAgent: string | null;
}

const BATCH_SIZE = 50;
const FLUSH_MS = 1000;

let pending: Array<{ row: PendingRow; resolve: () => void; reject: (e: unknown) => void }> = [];
let flushTimer: NodeJS.Timeout | null = null;

async function flush() {
  if (pending.length === 0) return;
  const batch = pending;
  pending = [];
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
  try {
    await prisma.event.createMany({ data: batch.map((b) => b.row) });
    for (const item of batch) item.resolve();
  } catch (err) {
    logger.error({ err, count: batch.length }, "event batch insert failed");
    for (const item of batch) item.reject(err);
  }
}

function scheduleFlush() {
  if (pending.length >= BATCH_SIZE) { void flush(); return; }
  if (flushTimer) return;
  flushTimer = setTimeout(() => { void flush(); }, FLUSH_MS);
}

export function startEventProcessorWorker() {
  const worker = new BullWorker<EventJob>(
    "events",
    async (job: Job<EventJob>) => {
      await new Promise<void>((resolve, reject) => {
        pending.push({
          row: {
            type: job.data.type,
            actorId: job.data.actorId,
            actorRole: job.data.actorRole,
            targetType: job.data.targetType,
            targetId: job.data.targetId,
            properties: job.data.properties ? (job.data.properties as object) : null,
            variantKey: job.data.variantKey,
            sessionId: job.data.sessionId,
            ipHash: job.data.ipHash,
            userAgent: job.data.userAgent,
          },
          resolve,
          reject,
        });
        scheduleFlush();
      });
    },
    { connection: redis, concurrency: 8 },
  );

  worker.on("failed", (job, err) => {
    logger.warn({ jobId: job?.id, err }, "event processing failed");
  });

  // On graceful shutdown, drain pending events.
  const drainOnExit = async () => { await flush().catch(() => undefined); };
  process.once("SIGINT", drainOnExit);
  process.once("SIGTERM", drainOnExit);

  return worker;
}
