/**
 * B2C escrow release — sends held deposits to the landlord's M-Pesa.
 *
 * The B2C security credential is highly sensitive. It is loaded ONLY in
 * this file (worker process) — never imported in the API service.
 *
 * Flow:
 *   1. Worker dequeues { escrowId }.
 *   2. We resolve landlord phone + payout amount (deposit minus our fee).
 *   3. POST /mpesa/b2c/v3/paymentrequest with the security credential.
 *   4. Daraja replies async to /v1/webhooks/mpesa/b2c-result.
 *   5. That handler flips Escrow.status to RELEASED.
 *
 * Idempotency: we set b2cConversationId before issuing the call. If the
 * worker crashes mid-call, on retry we abort if conversationId already set.
 */

import axios from "axios";
import { prisma } from "../db/client";
import { logger } from "../lib/logger";
import { ConflictError, ExternalServiceError } from "../lib/errors";
import { toDarajaFormat } from "../lib/phone";

interface DarajaB2CConfig {
  env: "sandbox" | "production";
  initiator: string;
  securityCredential: string;
  b2cShortcode: string;
  resultUrl: string;
  timeoutUrl: string;
}

function loadB2CConfig(): DarajaB2CConfig {
  const initiator = process.env.MPESA_B2C_INITIATOR;
  const cred = process.env.MPESA_B2C_SECURITY_CREDENTIAL;
  const shortcode = process.env.MPESA_B2C_SHORTCODE;
  const callbackBase = process.env.MPESA_CALLBACK_URL?.replace(/\/v1\/webhooks\/mpesa$/, "");
  if (!initiator || !cred || !shortcode || !callbackBase) {
    throw new ExternalServiceError("B2C not configured");
  }
  return {
    env: (process.env.MPESA_ENV as "sandbox" | "production") ?? "sandbox",
    initiator,
    securityCredential: cred,
    b2cShortcode: shortcode,
    resultUrl: `${callbackBase}/v1/webhooks/mpesa/b2c-result`,
    timeoutUrl: `${callbackBase}/v1/webhooks/mpesa/b2c-timeout`,
  };
}

async function getAccessToken(): Promise<string> {
  const auth = Buffer.from(
    `${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`,
  ).toString("base64");
  const base = (process.env.MPESA_ENV ?? "sandbox") === "production"
    ? "https://api.safaricom.co.ke"
    : "https://sandbox.safaricom.co.ke";
  const { data } = await axios.get<{ access_token: string }>(
    `${base}/oauth/v1/generate?grant_type=client_credentials`,
    { headers: { Authorization: `Basic ${auth}` }, timeout: 15_000 },
  );
  return data.access_token;
}

export async function releaseEscrow(escrowId: string): Promise<void> {
  const escrow = await prisma.escrow.findUnique({
    where: { id: escrowId },
    include: { lease: { include: { landlord: true, listing: true } } },
  });
  if (!escrow) throw new ConflictError(`Escrow not found: ${escrowId}`);
  if (escrow.status !== "HELD") throw new ConflictError(`Escrow status ${escrow.status} cannot be released`);
  if (escrow.b2cConversationId) {
    logger.warn({ escrowId }, "release already initiated; skipping duplicate");
    return;
  }

  const cfg = loadB2CConfig();
  const token = await getAccessToken();
  const payoutKes = Math.round((escrow.amountKesCents - escrow.feeKesCents) / 100);
  const phone = toDarajaFormat(escrow.lease.landlord.phoneE164);

  const base = cfg.env === "production" ? "https://api.safaricom.co.ke" : "https://sandbox.safaricom.co.ke";
  const body = {
    OriginatorConversationID: `nuru-${escrowId}`,
    InitiatorName: cfg.initiator,
    SecurityCredential: cfg.securityCredential,
    CommandID: "BusinessPayment",
    Amount: payoutKes,
    PartyA: cfg.b2cShortcode,
    PartyB: phone,
    Remarks: `Nuru deposit release for ${escrow.lease.listing.title.slice(0, 30)}`,
    QueueTimeOutURL: cfg.timeoutUrl,
    ResultURL: cfg.resultUrl,
    Occasion: "Deposit",
  };

  // Mark the conversation id BEFORE the call — idempotency anchor.
  await prisma.escrow.update({
    where: { id: escrowId },
    data: { b2cConversationId: body.OriginatorConversationID },
  });

  try {
    const { data } = await axios.post(`${base}/mpesa/b2c/v3/paymentrequest`, body, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 15_000,
    });
    await prisma.escrowEvent.create({
      data: { escrowId, type: "b2c_initiated", payload: data },
    });
    logger.info({ escrowId, conversationId: data.ConversationID }, "b2c initiated");
  } catch (err) {
    // If Daraja didn't accept the request, clear the marker so we can retry.
    await prisma.escrow.update({
      where: { id: escrowId },
      data: { b2cConversationId: null },
    });
    throw new ExternalServiceError("Daraja B2C", err);
  }
}
