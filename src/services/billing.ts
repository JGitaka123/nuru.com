/**
 * Subscription billing — drives M-Pesa STK push for OPEN invoices.
 *
 * Daraja doesn't support recurring charges, so we trigger an STK push
 * each cycle. The user must approve on their phone. If they don't, we
 * retry the next day (up to 3 attempts), then suspend.
 *
 * Idempotency: each invoice has a unique merchantRequestId. Callbacks
 * are dispatched here from the existing /v1/webhooks/mpesa handler.
 */

import { prisma } from "../db/client";
import { addMonths } from "../lib/dates";
import { ExternalServiceError, NotFoundError, ValidationError } from "../lib/errors";
import { buildDarajaFromEnv } from "./mpesa";
import { recordEvent } from "./events";
import { sendSms } from "./notifications";

const MAX_RETRIES = 3;

/** Initiate (or retry) charge for a single OPEN invoice. */
export async function chargeInvoice(invoiceId: string): Promise<{ status: "stk_sent" | "skipped"; reason?: string }> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { subscription: { include: { plan: true } } },
  });
  if (!invoice) throw new NotFoundError("Invoice");
  if (invoice.status !== "OPEN" && invoice.status !== "FAILED") {
    return { status: "skipped", reason: `invoice is ${invoice.status}` };
  }
  if (invoice.attempts >= MAX_RETRIES) {
    return { status: "skipped", reason: "max retries reached" };
  }

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: invoice.subscription.userId },
    select: { phoneE164: true, name: true },
  });
  if (!user.phoneE164) {
    throw new ValidationError("Add a phone number before paying with M-Pesa");
  }

  const daraja = buildDarajaFromEnv();
  const amountKes = Math.max(1, Math.round(invoice.amountKesCents / 100));

  const stk = await daraja.stkPush({
    phoneE164: user.phoneE164,
    amountKes,
    accountReference: `NS-${invoice.id.slice(0, 9)}`,
    description: `Nuru ${invoice.subscription.plan.name}`,
  }).catch(async (err) => {
    // STK never reached the user (Daraja down/timeout): no callback will
    // arrive, so count the failure here — otherwise send-errors never
    // advance failedAttempts and the subscription can never be suspended.
    await prisma.$transaction([
      prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          status: "FAILED",
          attempts: { increment: 1 },
          lastAttemptAt: new Date(),
          failedReason: err instanceof Error ? err.message.slice(0, 500) : "stk_push failed",
        },
      }),
      prisma.subscription.update({
        where: { id: invoice.subscriptionId },
        data: { failedAttempts: { increment: 1 } },
      }),
    ]);
    // Typed error so the /v1/billing/retry route returns a 502 (not a raw
    // 500). The worker path catches and logs it either way.
    throw new ExternalServiceError("M-Pesa", err);
  });

  await prisma.invoice.update({
    where: { id: invoice.id },
    data: {
      status: "PROCESSING",
      stkCheckoutId: stk.checkoutRequestId,
      stkMerchantId: stk.merchantRequestId,
      attempts: { increment: 1 },
      lastAttemptAt: new Date(),
    },
  });

  // Friendly nudge SMS — STK prompts on the phone are easy to miss.
  sendSms(
    user.phoneE164,
    `Nuru: We've sent an M-Pesa prompt for KES ${amountKes.toLocaleString("en-KE")} for your ${invoice.subscription.plan.name} plan. Check your phone.`,
  ).catch(() => undefined);

  recordEvent({
    type: "escrow_initiated",   // re-using existing event type name; analytic-wise it's fine
    actorId: invoice.subscription.userId,
    targetType: "invoice",
    targetId: invoice.id,
    properties: { kind: "subscription_charge", amountKes, attempts: invoice.attempts + 1 },
  });

  return { status: "stk_sent" };
}

/**
 * Daraja STK callback handler — billing variant. The webhook handler
 * (src/services/escrow.ts:handleStkCallback) already dispatches to escrow;
 * we add a thin wrapper that checks the merchantRequestId against Invoice
 * BEFORE Escrow, since the AccountReference prefix `NS-` distinguishes them.
 */
export async function handleSubscriptionStkCallback(merchantRequestId: string, payload: {
  resultCode: number;
  resultDesc: string;
  amount?: number;
  mpesaReceiptNumber?: string;
}): Promise<boolean> {
  const invoice = await prisma.invoice.findUnique({
    where: { stkMerchantId: merchantRequestId },
    include: { subscription: true },
  });
  if (!invoice) return false;     // not a subscription invoice

  // Idempotency: we only act on a callback while the invoice is awaiting
  // one (PROCESSING). Any other state means this callback is a duplicate
  // (Daraja retries callbacks) or stale — PAID/FAILED were already
  // recorded, VOID was written off, OPEN was never charged. Acking without
  // re-processing prevents duplicate failure callbacks from inflating
  // failedAttempts (which drives auto-suspension) and stops a late success
  // from resurrecting a voided invoice.
  if (invoice.status !== "PROCESSING") return true;

  if (payload.resultCode === 0 && payload.mpesaReceiptNumber) {
    const now = new Date();
    await prisma.$transaction([
      prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          status: "PAID",
          paidAt: now,
          mpesaReceipt: payload.mpesaReceiptNumber,
        },
      }),
      prisma.subscription.update({
        where: { id: invoice.subscriptionId },
        data: {
          status: "ACTIVE",
          lastChargeAt: now,
          nextChargeAt: invoice.periodEnd,
          failedAttempts: 0,
        },
      }),
    ]);

    const sub = await prisma.subscription.findUniqueOrThrow({ where: { id: invoice.subscriptionId } });
    const user = await prisma.user.findUniqueOrThrow({ where: { id: sub.userId } });
    if (user.phoneE164) {
      sendSms(
        user.phoneE164,
        `Nuru: Payment received. Your subscription is active until ${invoice.periodEnd.toISOString().slice(0, 10)}. Receipt: ${payload.mpesaReceiptNumber}.`,
      ).catch(() => undefined);
    }

    recordEvent({
      type: "escrow_held",
      actorId: sub.userId,
      targetType: "invoice",
      targetId: invoice.id,
      properties: { kind: "subscription_paid", receipt: payload.mpesaReceiptNumber },
    });
  } else {
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        status: "FAILED",
        failedReason: payload.resultDesc.slice(0, 500),
      },
    });
    await prisma.subscription.update({
      where: { id: invoice.subscriptionId },
      data: { failedAttempts: { increment: 1 } },
    });
  }
  return true;
}

/** Generate the next period's invoice when the current period ends. */
export async function rolloverPeriod(subscriptionId: string): Promise<void> {
  const sub = await prisma.subscription.findUniqueOrThrow({
    where: { id: subscriptionId },
    include: { plan: true },
  });
  if (sub.cancelAtPeriodEnd) {
    await prisma.subscription.update({
      where: { id: subscriptionId },
      data: { status: "EXPIRED" },
    });
    return;
  }
  if (sub.planTier === "TRIAL") {
    // Trial expires; downgrade is handled by the agent-task runner
    // (which can offer a paid plan with a personalized email).
    return;
  }
  const periodStart = sub.currentPeriodEnd;
  const periodEnd = addMonths(periodStart, 1);
  await prisma.$transaction([
    prisma.subscription.update({
      where: { id: subscriptionId },
      data: {
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        nextChargeAt: periodEnd,
      },
    }),
    prisma.invoice.create({
      data: {
        subscriptionId,
        amountKesCents: sub.plan.monthlyKesCents,
        periodStart,
        periodEnd,
        status: "OPEN",
        dueAt: periodStart,
      },
    }),
  ]);
}
