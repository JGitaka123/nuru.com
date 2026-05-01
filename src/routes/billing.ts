/**
 * Billing routes — agent/landlord-facing.
 *
 *   GET  /v1/billing/plans                    public; pricing + features
 *   GET  /v1/billing/me                       (auth) current sub + invoices
 *   POST /v1/billing/change-plan              (auth) upgrade/downgrade
 *   POST /v1/billing/cancel                   (auth) cancel-at-period-end
 *   POST /v1/billing/resume                   (auth) revert cancel
 *   POST /v1/billing/retry                    (auth) retry latest failed invoice
 */

import type { FastifyInstance } from "fastify";
import { requireAuth, requireRole } from "../lib/auth";
import { z } from "zod";
import { prisma } from "../db/client";
import { PLANS } from "../services/plans";
import {
  ensureTrial, getCurrent, changePlan, cancelAtPeriodEnd, resumeSubscription,
  ChangePlanSchema,
} from "../services/subscriptions";
import { chargeInvoice } from "../services/billing";
import { ConflictError, ValidationError } from "../lib/errors";

export async function billingRoutes(app: FastifyInstance) {
  app.get("/v1/billing/plans", async (_req, reply) => {
    return reply.send({ plans: Object.values(PLANS) });
  });

  app.get(
    "/v1/billing/me",
    { preHandler: requireRole("AGENT", "LANDLORD", "ADMIN") },
    async (req, reply) => {
      const userId = req.user!.sub;
      let sub = await getCurrent(userId);
      if (!sub) {
        await ensureTrial(userId);
        sub = await getCurrent(userId);
      }
      return reply.send(sub);
    },
  );

  app.post(
    "/v1/billing/change-plan",
    { preHandler: requireRole("AGENT", "LANDLORD", "ADMIN") },
    async (req, reply) => {
      const input = ChangePlanSchema.parse(req.body);
      const sub = await changePlan(req.user!.sub, input);
      return reply.send(sub);
    },
  );

  app.post(
    "/v1/billing/cancel",
    { preHandler: requireAuth },
    async (req, reply) => {
      const sub = await cancelAtPeriodEnd(req.user!.sub);
      return reply.send(sub);
    },
  );

  app.post(
    "/v1/billing/resume",
    { preHandler: requireAuth },
    async (req, reply) => {
      const sub = await resumeSubscription(req.user!.sub);
      return reply.send(sub);
    },
  );

  app.post(
    "/v1/billing/retry",
    { preHandler: requireAuth },
    async (req, reply) => {
      const userId = req.user!.sub;
      const inv = await prisma.invoice.findFirst({
        where: { subscription: { userId }, status: { in: ["FAILED", "OPEN"] } },
        orderBy: { createdAt: "desc" },
      });
      if (!inv) throw new ConflictError("No invoice to retry");
      if (inv.attempts >= 3) throw new ValidationError("Max retries reached — contact support");
      const r = await chargeInvoice(inv.id);
      return reply.send(r);
    },
  );
}
