/**
 * SMS via Africa's Talking. WhatsApp + email come later.
 *
 * Africa's Talking is the de-facto SMS provider in Kenya. Cheap, reliable,
 * and the sender ID approval process for "NURU" takes ~3 days.
 */

import AfricasTalking from "africastalking";
import { logger } from "../lib/logger";

// Constructed lazily — AfricasTalking() throws on an empty apiKey, and the
// API must still boot (with SMS no-oping) before creds are provisioned.
let at: ReturnType<typeof AfricasTalking> | null = null;

export async function sendSms(phoneE164: string, message: string) {
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
