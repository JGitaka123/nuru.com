/**
 * Escrow service — orchestrates the deposit lifecycle.
 *
 * Lifecycle:
 *   1. Tenant approves application → Escrow created (PENDING)
 *   2. Tenant confirms → STK push sent → Escrow.stkCheckoutId set
 *   3. Daraja callback success → Escrow becomes HELD, lease becomes ACTIVE
 *   4. Tenant confirms move-in (or 7 days pass with no dispute) → B2C
 *      payout to landlord → Escrow becomes RELEASED
 *   5. Dispute path → Escrow stays HELD until ops resolves
 *
 * Idempotency is everything. Daraja can call our callback multiple times.
 * We dedupe on merchantRequestId. We never decrement state.
 */

import { prisma } from "../db/client";
import { buildDarajaFromEnv, type StkCallbackPayload } from "./mpesa";
import { logger } from "../lib/logger";
import { sendSms } from "./notifications";
import { escrowReleaseQueue } from "../workers/queues";
import { ConflictError, NotFoundError } from "../lib/errors";
import { recordEvent } from "./events";

export interface InitiateDepositInput {
  leaseId: string;
  tenantPhoneE164: string;
  depositKesCents: number;
}

export async function initiateDeposit(input: InitiateDepositInput) {
  const lease = await prisma.lease.findUniqueOrThrow({
    where: { id: input.leaseId },
    include: { escrow: true, listing: true },
  });

  if (lease.escrow?.status === "HELD") {
    throw new ConflictError("Deposit already paid");
  }

  // Our fee: 1% of deposit, capped at 5000 KES.
  const feeKesCents = Math.min(Math.round(input.depositKesCents * 0.01), 500_000);

  // Upsert: re-using stale PENDING escrow from a prior failed attempt is fine.
  const escrow = await prisma.escrow.upsert({
    where: { leaseId: input.leaseId },
    create: {
      leaseId: input.leaseId,
      amountKesCents: input.depositKesCents,
      feeKesCents,
      status: "PENDING",
    },
    update: { status: "PENDING" },
  });

  const daraja = buildDarajaFromEnv();
  const amountKes = Math.round(input.depositKesCents / 100);

  const stk = await daraja.stkPush({
    phoneE164: input.tenantPhoneE164,
    amountKes,
    accountReference: escrow.id.slice(0, 12),
    description: "Nuru deposit",
  });

  await prisma.escrow.update({
    where: { id: escrow.id },
    data: {
      stkCheckoutId: stk.checkoutRequestId,
      stkMerchantId: stk.merchantRequestId,
      events: {
        create: { type: "stk_initiated", payload: stk as any },
      },
    },
  });

  recordEvent({
    type: "escrow_initiated",
    actorId: lease.tenantId,
    actorRole: "TENANT",
    targetType: "escrow",
    targetId: escrow.id,
    properties: { leaseId: lease.id, amountKesCents: input.depositKesCents },
  });

  return { escrowId: escrow.id, customerMessage: stk.customerMessage };
}

/**
 * Handle a Daraja STK callback. Called from the webhook route.
 * MUST be idempotent — Daraja retries on network failures.
 */
export async function handleStkCallback(cb: StkCallbackPayload) {
  const escrow = await prisma.escrow.findFirst({
    where: { stkMerchantId: cb.merchantRequestId },
    include: { lease: { include: { listing: true, tenant: true, landlord: true } } },
  });

  if (!escrow) {
    logger.warn({ cb }, "callback for unknown merchantRequestId — ignoring");
    return; // Daraja sometimes calls back for stale/sandbox transactions.
  }

  // Always log the event for audit, even on duplicate.
  await prisma.escrowEvent.create({
    data: { escrowId: escrow.id, type: "stk_callback", payload: cb as any },
  });

  if (escrow.status === "HELD" || escrow.status === "RELEASED") {
    logger.info({ escrowId: escrow.id }, "duplicate callback — already settled");
    return;
  }

  if (cb.resultCode === 0 && cb.mpesaReceiptNumber) {
    await prisma.$transaction([
      prisma.escrow.update({
        where: { id: escrow.id },
        data: {
          status: "HELD",
          mpesaReceipt: cb.mpesaReceiptNumber,
          paidAt: new Date(),
        },
      }),
      prisma.lease.update({
        where: { id: escrow.leaseId },
        data: { status: "ACTIVE" },
      }),
      prisma.listing.update({
        where: { id: escrow.lease.listingId },
        data: { status: "RENTED", rentedAt: new Date() },
      }),
    ]);

    // Fire-and-forget notifications.
    sendSms(
      escrow.lease.tenant.phoneE164,
      `Nuru: Your deposit of KES ${cb.amount} is held safely. ` +
        `It will be released to the landlord after you confirm move-in.`
    ).catch((e) => logger.error(e, "tenant sms failed"));
    sendSms(
      escrow.lease.landlord.phoneE164,
      `Nuru: Deposit received and held in escrow for "${escrow.lease.listing.title}". ` +
        `It will be released after the tenant confirms move-in.`
    ).catch((e) => logger.error(e, "landlord sms failed"));

    recordEvent({
      type: "escrow_held",
      actorId: escrow.lease.tenantId,
      actorRole: "TENANT",
      targetType: "escrow",
      targetId: escrow.id,
      properties: { leaseId: escrow.leaseId, listingId: escrow.lease.listingId },
    });
  } else {
    // Failure path: ResultCode != 0 means tenant cancelled, timed out,
    // wrong PIN, insufficient funds, etc.
    await prisma.escrow.update({
      where: { id: escrow.id },
      data: { status: "PENDING" }, // user can retry
    });
    logger.info(
      { escrowId: escrow.id, resultCode: cb.resultCode, resultDesc: cb.resultDesc },
      "stk push not completed"
    );
  }
}

/**
 * Tenant confirms move-in or 7 days pass — release deposit to landlord
 * via Daraja B2C. (B2C scaffolding lives in a separate file; the trigger
 * lives here so the escrow lifecycle is centralized.)
 */
export async function confirmMoveIn(escrowId: string, byUserId: string) {
  const escrow = await prisma.escrow.findUnique({
    where: { id: escrowId },
    include: { lease: true },
  });
  if (!escrow) throw new NotFoundError("Escrow");
  if (escrow.status !== "HELD") {
    throw new ConflictError(`Cannot release escrow in status ${escrow.status}`);
  }
  if (escrow.lease.tenantId !== byUserId) {
    throw new ConflictError("Only the tenant can confirm move-in");
  }

  // Idempotent: jobId is the escrow id, so duplicate confirms collapse.
  await escrowReleaseQueue.add(
    "release",
    { escrowId },
    { jobId: `release-${escrowId}`, attempts: 5, backoff: { type: "exponential", delay: 30_000 } },
  );

  await prisma.escrowEvent.create({
    data: { escrowId, type: "release_queued", payload: { byUserId } },
  });
  return { queued: true };
}
