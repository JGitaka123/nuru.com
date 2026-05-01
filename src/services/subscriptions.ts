/**
 * Subscription lifecycle.
 *
 * - Trial: auto-issued on first agent/landlord login. 30 days. Free.
 * - Upgrade: user picks a paid tier → an invoice is generated and the
 *   billing worker initiates an STK push. On payment, status → ACTIVE.
 * - Cancel: status stays ACTIVE until currentPeriodEnd; cancelAtPeriodEnd=true.
 * - Past-due: STK failed; retry next day; after 3 fails, suspend.
 *
 * Enforcement:
 *   - canCreateListing(userId) — checks active count vs plan cap.
 *   - feature(userId, key) — checks plan features.
 */

import { z } from "zod";
import type { PlanTier, Subscription } from "@prisma/client";
import { prisma } from "../db/client";
import { ConflictError, NotFoundError, ValidationError } from "../lib/errors";
import { planFor, type PlanFeatures } from "./plans";
import { logger } from "../lib/logger";
import { recordEvent } from "./events";

const TRIAL_DAYS = Number(process.env.TRIAL_DAYS ?? 30);

export const ChangePlanSchema = z.object({
  planTier: z.enum(["BRONZE", "SILVER", "GOLD", "PLATINUM"]),
  promoCode: z.string().max(40).optional(),
});

/**
 * Idempotently issue a TRIAL subscription. Called when a user upgrades
 * their role to AGENT/LANDLORD or first hits the agent dashboard.
 */
export async function ensureTrial(userId: string): Promise<Subscription> {
  const existing = await prisma.subscription.findUnique({ where: { userId } });
  if (existing) return existing;

  const now = new Date();
  const trialEnd = new Date(now.getTime() + TRIAL_DAYS * 86_400_000);

  const sub = await prisma.subscription.create({
    data: {
      userId,
      planTier: "TRIAL",
      status: "TRIALING",
      trialEndsAt: trialEnd,
      currentPeriodStart: now,
      currentPeriodEnd: trialEnd,
      nextChargeAt: null,
    },
  });
  recordEvent({
    type: "ai_call",            // generic; reused — not strictly an AI call
    actorId: userId,
    targetType: "subscription",
    targetId: sub.id,
    properties: { kind: "trial_issued", days: TRIAL_DAYS },
  });
  logger.info({ userId, trialEnd }, "trial issued");
  return sub;
}

export async function getCurrent(userId: string) {
  const sub = await prisma.subscription.findUnique({
    where: { userId },
    include: { plan: true, invoices: { orderBy: { createdAt: "desc" }, take: 5 } },
  });
  return sub;
}

/** Schedule an upgrade to a paid tier. Generates an OPEN invoice; the
 *  billing worker will STK-push. */
export async function changePlan(userId: string, input: z.infer<typeof ChangePlanSchema>) {
  const { planTier, promoCode } = ChangePlanSchema.parse(input);
  const sub = await prisma.subscription.findUnique({ where: { userId } });
  if (!sub) throw new NotFoundError("Subscription");
  if (sub.status === "EXPIRED" || sub.status === "PAUSED") {
    throw new ConflictError(`Subscription is ${sub.status} — contact support`);
  }

  const plan = planFor(planTier);
  let amount = plan.monthlyKesCents;

  let promo = null;
  if (promoCode) {
    promo = await prisma.promoCode.findUnique({ where: { code: promoCode.toUpperCase() } });
    if (!promo) throw new ValidationError("Invalid promo code");
    if (promo.expiresAt && promo.expiresAt < new Date()) {
      throw new ValidationError("Promo code has expired");
    }
    if (promo.maxRedemptions && promo.redemptions >= promo.maxRedemptions) {
      throw new ValidationError("Promo code is fully redeemed");
    }
    if (promo.appliesToTiers.length > 0 && !promo.appliesToTiers.includes(planTier)) {
      throw new ValidationError("Promo not valid on this plan");
    }
    if (promo.discountPct > 0) {
      amount = Math.round(amount * (1 - promo.discountPct / 100));
    }
  }

  const now = new Date();
  const periodEnd = new Date(now);
  // freeMonths skip the first charge entirely.
  const freeMonths = promo?.freeMonths ?? 0;
  periodEnd.setMonth(periodEnd.getMonth() + 1 + freeMonths);

  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.subscription.update({
      where: { userId },
      data: {
        planTier,
        status: amount === 0 || freeMonths > 0 ? "ACTIVE" : "PAST_DUE",
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: false,
        canceledAt: null,
        nextChargeAt: periodEnd,
        promoCodeId: promo?.code ?? null,
        failedAttempts: 0,
      },
    });
    if (amount > 0 && freeMonths === 0) {
      await tx.invoice.create({
        data: {
          subscriptionId: next.id,
          amountKesCents: amount,
          periodStart: now,
          periodEnd,
          status: "OPEN",
          dueAt: now,
        },
      });
    }
    if (promo) {
      await tx.promoCode.update({
        where: { code: promo.code },
        data: { redemptions: { increment: 1 } },
      });
    }
    return next;
  });

  recordEvent({
    type: "ai_call",
    actorId: userId,
    targetType: "subscription",
    targetId: updated.id,
    properties: { kind: "plan_changed", to: planTier, promo: promo?.code ?? null, amount },
  });
  return updated;
}

export async function cancelAtPeriodEnd(userId: string) {
  const sub = await prisma.subscription.findUnique({ where: { userId } });
  if (!sub) throw new NotFoundError("Subscription");
  if (sub.status === "EXPIRED") throw new ConflictError("Already expired");
  return prisma.subscription.update({
    where: { userId },
    data: { cancelAtPeriodEnd: true, canceledAt: new Date(), status: "CANCELED" },
  });
}

export async function resumeSubscription(userId: string) {
  return prisma.subscription.update({
    where: { userId },
    data: { cancelAtPeriodEnd: false, canceledAt: null, status: "ACTIVE" },
  });
}

/** Caller must pass a userId that owns listings (agent/landlord/admin). */
export async function canCreateListing(userId: string): Promise<{ ok: boolean; reason?: string; current: number; cap: number | null }> {
  const sub = await prisma.subscription.findUnique({ where: { userId } });
  if (!sub) {
    return { ok: false, reason: "No active subscription", current: 0, cap: 0 };
  }
  if (sub.status === "EXPIRED" || sub.status === "PAUSED") {
    return { ok: false, reason: `Subscription is ${sub.status}`, current: 0, cap: 0 };
  }
  const plan = planFor(sub.planTier);
  if (plan.maxActiveListings === null) {
    return { ok: true, current: 0, cap: null };
  }
  const active = await prisma.listing.count({
    where: { agentId: userId, status: { in: ["ACTIVE", "PENDING_REVIEW", "PAUSED"] } },
  });
  if (active >= plan.maxActiveListings) {
    return {
      ok: false,
      reason: `Plan cap reached (${active}/${plan.maxActiveListings}). Upgrade to add more.`,
      current: active,
      cap: plan.maxActiveListings,
    };
  }
  return { ok: true, current: active, cap: plan.maxActiveListings };
}

export async function feature(userId: string, key: keyof PlanFeatures): Promise<boolean> {
  const sub = await prisma.subscription.findUnique({ where: { userId } });
  if (!sub || sub.status === "EXPIRED" || sub.status === "PAUSED") return false;
  const plan = planFor(sub.planTier);
  const v = plan.features[key];
  return typeof v === "boolean" ? v : v > 0;
}
