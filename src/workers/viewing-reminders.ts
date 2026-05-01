/**
 * Viewing reminders worker. Two paths:
 *
 *  - Per-viewing job: when a viewing is confirmed, the API enqueues a delayed
 *    job for ~24h before scheduledAt.
 *  - Scheduled scanner: fallback that finds all viewings in the next 25h with
 *    no reminder sent yet. Catches anything missed (e.g. worker downtime).
 */

import { Worker as BullWorker } from "bullmq";
import { prisma } from "../db/client";
import { sendSms } from "../services/notifications";
import { logger } from "../lib/logger";
import { redis, type ViewingReminderJob } from "./queues";

export function startViewingReminderWorker() {
  const worker = new BullWorker<ViewingReminderJob>(
    "viewing-reminders",
    async (job) => {
      const { viewingId, channel } = job.data;
      const v = await prisma.viewing.findUnique({
        where: { id: viewingId },
        include: {
          tenant: { select: { phoneE164: true, name: true } },
          listing: { select: { title: true, neighborhood: true, agent: { select: { phoneE164: true } } } },
        },
      });
      if (!v) return; // viewing was deleted
      if (v.status !== "CONFIRMED" && v.status !== "REQUESTED") return;
      if (v.scheduledAt.getTime() < Date.now()) return; // already past

      const eatTime = new Date(v.scheduledAt.getTime() + 3 * 60 * 60 * 1000)
        .toISOString().slice(11, 16);
      const eatDate = new Date(v.scheduledAt.getTime() + 3 * 60 * 60 * 1000)
        .toISOString().slice(8, 10) + "/" +
        new Date(v.scheduledAt.getTime() + 3 * 60 * 60 * 1000).toISOString().slice(5, 7);
      const msg = `Nuru reminder: viewing for "${v.listing.title}" tomorrow at ${eatTime} EAT (${eatDate}). Reply CANCEL if you can't make it.`;

      if (channel === "sms") {
        await sendSms(v.tenant.phoneE164, msg);
        await sendSms(v.listing.agent.phoneE164, msg);
      }
      logger.info({ viewingId }, "reminder sent");
    },
    { connection: redis, concurrency: 8 },
  );

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err }, "viewing reminder failed");
  });
  return worker;
}
