/**
 * Daraja B2C result handlers.
 *
 * On success: flip Escrow → RELEASED, notify landlord.
 * On failure: leave Escrow as HELD, clear b2cConversationId so retry is possible.
 *
 * Payload shape (Daraja):
 *   { Result: { ResultCode, ResultDesc, OriginatorConversationID,
 *               TransactionID, ResultParameters: { ResultParameter: [{Key,Value}] } } }
 */

import { prisma } from "../db/client";
import { logger } from "../lib/logger";
import { sendSms } from "./notifications";

interface DarajaResult {
  Result?: {
    ResultCode?: number;
    ResultDesc?: string;
    OriginatorConversationID?: string;
    TransactionID?: string;
    ResultParameters?: { ResultParameter?: Array<{ Key: string; Value: string | number }> };
  };
}

function findOriginator(payload: unknown): string | null {
  const p = payload as DarajaResult;
  return p?.Result?.OriginatorConversationID ?? null;
}

export async function handleB2CResult(payload: unknown): Promise<void> {
  const p = payload as DarajaResult;
  const originator = findOriginator(payload);
  if (!originator) {
    logger.warn({ payload }, "b2c result missing originator");
    return;
  }

  const escrow = await prisma.escrow.findFirst({
    where: { b2cConversationId: originator },
    include: { lease: { include: { landlord: true, listing: true } } },
  });
  if (!escrow) {
    logger.warn({ originator }, "b2c result for unknown escrow — ignoring");
    return;
  }

  await prisma.escrowEvent.create({
    data: { escrowId: escrow.id, type: "b2c_result", payload: payload as object },
  });

  if (escrow.status === "RELEASED") {
    logger.info({ escrowId: escrow.id }, "b2c result duplicate — already released");
    return;
  }

  if (p.Result?.ResultCode === 0) {
    await prisma.escrow.update({
      where: { id: escrow.id },
      data: { status: "RELEASED", releasedAt: new Date() },
    });
    sendSms(
      escrow.lease.landlord.phoneE164,
      `Nuru: Deposit of KES ${Math.round((escrow.amountKesCents - escrow.feeKesCents) / 100)} has been sent to your M-Pesa for "${escrow.lease.listing.title}".`,
    ).catch(() => undefined);
    logger.info({ escrowId: escrow.id }, "escrow released");
  } else {
    // Allow retry by clearing the conversation id.
    await prisma.escrow.update({
      where: { id: escrow.id },
      data: { b2cConversationId: null },
    });
    logger.warn(
      { escrowId: escrow.id, code: p.Result?.ResultCode, desc: p.Result?.ResultDesc },
      "b2c failed — escrow can be retried",
    );
  }
}

export async function handleB2CTimeout(payload: unknown): Promise<void> {
  const originator = findOriginator(payload);
  if (!originator) return;
  const escrow = await prisma.escrow.findFirst({ where: { b2cConversationId: originator } });
  if (!escrow) return;

  await prisma.escrowEvent.create({
    data: { escrowId: escrow.id, type: "b2c_timeout", payload: payload as object },
  });
  // Clear the marker so a manual retry / rescheduled job can fire again.
  await prisma.escrow.update({
    where: { id: escrow.id },
    data: { b2cConversationId: null },
  });
  logger.warn({ escrowId: escrow.id }, "b2c timeout — needs manual review");
}
