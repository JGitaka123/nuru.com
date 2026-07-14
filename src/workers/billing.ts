/**
 * Subscription billing worker.
 *
 * Runs daily (or on-demand). For every OPEN/FAILED invoice that's due,
 * triggers an STK push. Also rolls over expiring subscription periods.
 */

import { Worker as BullWorker } from "bullmq";
import { prisma } from "../db/client";
import { logger } from "../lib/logger";
import { redis, type BillingJob } from "./queues";
import { chargeInvoice, rolloverPeriod } from "../services/billing";
import { isFreeLaunch, freeLaunchUntil } from "../services/plans";

const MAX_BILLING_RETRIES = 3;

export function startBillingWorker() {
  const worker = new BullWorker<BillingJob>(
    "billing",
    async () => {
      const now = new Date();

      // Free-launch window: nothing gets charged, retried, or rolled over.
      if (isFreeLaunch(now)) {
        logger.info({ until: freeLaunchUntil() }, "billing: free launch active — skipping run");
        return;
      }

      // 1. Charge OPEN/FAILED invoices that are due.
      const due = await prisma.invoice.findMany({
        where: {
          status: { in: ["OPEN", "FAILED"] },
          dueAt: { lte: now },
          attempts: { lt: 3 },
        },
        take: 200,
        orderBy: { dueAt: "asc" },
      });
      logger.info({ count: due.length }, "billing: charging due invoices");
      for (const inv of due) {
        await chargeInvoice(inv.id).catch((err) =>
          logger.warn({ err, invoiceId: inv.id }, "charge failed"),
        );
      }

      // 2. Mark FAILED 3-strike invoices as VOID and suspend their
      // subscriptions. Both failure modes (declined callback and STK
      // send-error) reach 3 attempts here, so this is the single place
      // that guarantees a non-paying subscription actually loses access —
      // otherwise it stays PAST_DUE (ungated) and is never re-invoiced.
      const deadInvoices = await prisma.invoice.findMany({
        where: { status: "FAILED", attempts: { gte: MAX_BILLING_RETRIES } },
        select: { id: true, subscription: { select: { id: true, userId: true } } },
        take: 200,
      });
      if (deadInvoices.length > 0) {
        const subIds = [...new Set(deadInvoices.map((i) => i.subscription.id))];
        const userIds = [...new Set(deadInvoices.map((i) => i.subscription.userId))];
        await prisma.$transaction([
          prisma.invoice.updateMany({
            where: { id: { in: deadInvoices.map((i) => i.id) } },
            data: { status: "VOID" },
          }),
          prisma.subscription.updateMany({
            where: { id: { in: subIds }, status: { notIn: ["CANCELED", "EXPIRED"] } },
            data: { status: "PAUSED" },
          }),
          // Pause the agents' live listings while suspended.
          prisma.listing.updateMany({
            where: { agentId: { in: userIds }, status: { in: ["ACTIVE", "PENDING_REVIEW"] } },
            data: { status: "PAUSED" },
          }),
        ]);
        logger.info({ count: deadInvoices.length, subs: subIds.length }, "billing: voided dead invoices + suspended subs");
      }

      // 3. Roll over subscriptions whose currentPeriodEnd is <=24h away.
      const horizon = new Date(now.getTime() + 24 * 3600 * 1000);
      const rollers = await prisma.subscription.findMany({
        where: {
          status: { in: ["ACTIVE", "CANCELED"] },
          currentPeriodEnd: { lte: horizon },
          planTier: { not: "TRIAL" },
        },
        take: 200,
      });
      for (const sub of rollers) {
        await rolloverPeriod(sub.id).catch((err) =>
          logger.warn({ err, subscriptionId: sub.id }, "rollover failed"),
        );
      }
    },
    { connection: redis, concurrency: 1 },
  );
  worker.on("failed", (job, err) => logger.error({ jobId: job?.id, err }, "billing worker failed"));
  return worker;
}
