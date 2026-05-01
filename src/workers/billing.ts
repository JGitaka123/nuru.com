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

export function startBillingWorker() {
  const worker = new BullWorker<BillingJob>(
    "billing",
    async () => {
      const now = new Date();

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

      // 2. Mark FAILED 3-strike invoices as VOID + flip subscription.
      const dead = await prisma.invoice.updateMany({
        where: { status: "FAILED", attempts: { gte: 3 } },
        data: { status: "VOID" },
      });
      if (dead.count > 0) logger.info({ count: dead.count }, "billing: voided dead invoices");

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
