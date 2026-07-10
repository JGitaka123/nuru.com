/**
 * SMS gateway wrapper.
 *
 * Production can use Onfon/SwiftAlert via ONFON_* env vars. Africa's Talking
 * remains supported as a fallback for older deployments.
 */

import AfricasTalking from "africastalking";
import axios from "axios";
import { ExternalServiceError } from "../lib/errors";
import { logger } from "../lib/logger";
import { toDarajaFormat } from "../lib/phone";

// Constructed lazily because provider SDKs should not block API boot when
// credentials are still being provisioned.
let at: ReturnType<typeof AfricasTalking> | null = null;

type SmsProvider = "onfon" | "africas-talking";

interface OnfonConfig {
  apiKey: string;
  clientId: string;
  accessKey: string;
  senderId: string;
  baseUrl: string;
}

interface OnfonResponse {
  ErrorCode?: number;
  ErrorDescription?: string;
  Data?: Array<{ MobileNumber?: string; MessageId?: string }>;
}

function firstEnv(...names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return undefined;
}

function normalizeProvider(input: string | undefined): SmsProvider | null {
  const p = input?.trim().toLowerCase();
  if (!p) return null;
  if (p === "onfon" || p === "swiftalert") return "onfon";
  if (p === "africastalking" || p === "africas-talking" || p === "at") return "africas-talking";
  return null;
}

function onfonConfig(): OnfonConfig | null {
  const apiKey = firstEnv("ONFON_API_KEY", "SWIFTALERT_API_KEY");
  const clientId = firstEnv("ONFON_CLIENT_ID", "SWIFTALERT_CLIENT_ID");
  const accessKey = firstEnv("ONFON_ACCESS_KEY", "SWIFTALERT_ACCESS_KEY");
  const senderId = firstEnv("ONFON_SENDER_ID", "SWIFTALERT_SENDER_ID");
  if (!apiKey || !clientId || !accessKey || !senderId) return null;
  return {
    apiKey,
    clientId,
    accessKey,
    senderId,
    baseUrl: firstEnv("ONFON_BASE_URL", "SWIFTALERT_BASE_URL") ?? "https://api.onfonmedia.co.ke/v1/sms",
  };
}

function selectedProvider(): SmsProvider | null {
  const explicit = normalizeProvider(process.env.SMS_PROVIDER);
  if (explicit) return explicit;
  if (onfonConfig()) return "onfon";
  if (process.env.AT_API_KEY) return "africas-talking";
  return null;
}

export function isSmsConfigured(): boolean {
  const provider = selectedProvider();
  if (provider === "onfon") return !!onfonConfig();
  if (provider === "africas-talking") return !!process.env.AT_API_KEY;
  return false;
}

export async function sendSms(phoneE164: string, message: string) {
  const provider = selectedProvider();
  if (provider === "onfon") {
    await sendOnfonSms(phoneE164, message);
    return;
  }
  if (provider === "africas-talking") {
    await sendAfricaTalkingSms(phoneE164, message);
    return;
  }
  logger.warn({ to: "[redacted]", messageLength: message.length }, "SMS not configured - skipping");
}

async function sendOnfonSms(phoneE164: string, message: string) {
  const cfg = onfonConfig();
  if (!cfg) {
    logger.warn({ to: "[redacted]", messageLength: message.length }, "Onfon SMS not configured - skipping");
    return;
  }

  const { data } = await axios.post<OnfonResponse>(
    `${cfg.baseUrl.replace(/\/+$/, "")}/SendBulkSMS`,
    {
      SenderId: cfg.senderId,
      MessageParameters: [{ Number: toDarajaFormat(phoneE164), Text: message }],
      ApiKey: cfg.apiKey,
      ClientId: cfg.clientId,
    },
    {
      headers: {
        "Content-Type": "application/json",
        AccessKey: cfg.accessKey,
      },
      timeout: 15_000,
    },
  );

  if (data.ErrorCode !== 0) {
    logger.error({ errorCode: data.ErrorCode, description: data.ErrorDescription }, "Onfon SMS rejected");
    throw new ExternalServiceError("Onfon SMS", data);
  }
  logger.info({ messages: data.Data?.length ?? 0 }, "Onfon SMS accepted");
}

async function sendAfricaTalkingSms(phoneE164: string, message: string) {
  if (!process.env.AT_API_KEY) {
    logger.warn({ to: "[redacted]", messageLength: message.length }, "AT not configured - skipping sms");
    return;
  }
  at ??= AfricasTalking({
    apiKey: process.env.AT_API_KEY,
    username: process.env.AT_USERNAME ?? "sandbox",
  });
  await at.SMS.send({
    to: [phoneE164],
    message,
    from: process.env.AT_SENDER_ID,
  });
}
