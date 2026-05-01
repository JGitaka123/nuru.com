/**
 * Outreach sender. Drains QUEUED OutreachEmail rows:
 *   1. Compose subject + body via Sonnet (outreach-composer.ts).
 *   2. Suppression check.
 *   3. Send via Resend.
 *   4. Update OutreachEmail status + timestamps; bump Lead.stage to CONTACTED.
 *
 * Rate-limited: at most 1 send per 2s per worker. Increase concurrency
 * across worker processes when warranted.
 */

import { Worker as BullWorker } from "bullmq";
import { prisma } from "../db/client";
import { logger } from "../lib/logger";
import { redis, type OutreachSendJob } from "./queues";
import { composeOutreach } from "../prompts/outreach-composer";
import { send, isSuppressed } from "../services/email";

const MIN_GAP_MS = 2000;       // floor between sends per worker

export function startOutreachSenderWorker() {
  let lastSent = 0;
  const worker = new BullWorker<OutreachSendJob>(
    "outreach-send",
    async (job) => {
      const where = {
        status: "QUEUED" as const,
        ...(job.data.campaignId ? { campaignId: job.data.campaignId } : {}),
      };
      const queued = await prisma.outreachEmail.findMany({
        where,
        orderBy: { createdAt: "asc" },
        include: { lead: true, campaign: true },
        take: 50,
      });
      logger.info({ count: queued.length, campaignId: job.data.campaignId }, "outreach drain");

      for (const email of queued) {
        try {
          await processOne(email);
        } catch (err) {
          logger.error({ err, emailId: email.id }, "outreach send failed");
          await prisma.outreachEmail.update({
            where: { id: email.id },
            data: {
              status: "FAILED",
              failedReason: err instanceof Error ? err.message.slice(0, 500) : "unknown",
            },
          });
        }
        const gap = MIN_GAP_MS - (Date.now() - lastSent);
        if (gap > 0) await new Promise((r) => setTimeout(r, gap));
        lastSent = Date.now();
      }
    },
    { connection: redis, concurrency: 1 },
  );

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err }, "outreach worker failed");
  });
  return worker;
}

async function processOne(
  email: NonNullable<Awaited<ReturnType<typeof loadEmail>>>,
): Promise<void> {
  if (!email.lead.email) {
    await prisma.outreachEmail.update({
      where: { id: email.id },
      data: { status: "FAILED", failedReason: "lead has no email" },
    });
    return;
  }

  // 1. Suppression check.
  if (await isSuppressed(email.lead.email)) {
    await prisma.outreachEmail.update({
      where: { id: email.id },
      data: { status: "SUPPRESSED", suppressed: true },
    });
    return;
  }

  // 2. Compose.
  const composed = await composeOutreach(
    {
      templatePromptKey: email.templatePromptKey,
      lead: {
        type: email.lead.type,
        organizationName: email.lead.organizationName,
        contactName: email.lead.contactName,
        city: email.lead.city,
        estimatedListingsCount: email.lead.estimatedListingsCount,
        signalNotes: email.lead.signalNotes,
      },
    },
    { actorId: null, targetId: email.leadId },
  );

  if (composed.content.skip) {
    await prisma.outreachEmail.update({
      where: { id: email.id },
      data: {
        status: "FAILED",
        failedReason: `composer skipped: ${composed.content.skipReason ?? "no reason"}`,
      },
    });
    return;
  }

  // 3. Save composed content + send.
  await prisma.outreachEmail.update({
    where: { id: email.id },
    data: {
      subject: composed.content.subject,
      bodyText: composed.content.body,
    },
  });

  const result = await send({
    to: email.lead.email,
    subject: composed.content.subject,
    text: composed.content.body,
    marketing: true,
    tags: [
      { name: "campaign", value: email.campaignId ?? "ad-hoc" },
      { name: "template", value: email.templatePromptKey },
      { name: "lead_type", value: email.lead.type },
    ],
  });

  if (!result.sent) {
    await prisma.outreachEmail.update({
      where: { id: email.id },
      data: {
        status: result.suppressed ? "SUPPRESSED" : "FAILED",
        failedReason: result.reason ?? "send returned not-sent",
      },
    });
    return;
  }

  await prisma.outreachEmail.update({
    where: { id: email.id },
    data: { status: "SENT", sentAt: new Date(), resendId: result.id },
  });

  await prisma.lead.update({
    where: { id: email.leadId },
    data: {
      stage: "CONTACTED",
      lastContactedAt: new Date(),
      ...(email.lead.firstContactedAt ? {} : { firstContactedAt: new Date() }),
    },
  });
}

async function loadEmail(id: string) {
  return prisma.outreachEmail.findUnique({
    where: { id },
    include: { lead: true, campaign: true },
  });
}
