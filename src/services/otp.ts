/**
 * Phone OTP — issue + verify 6-digit codes via Africa's Talking SMS.
 *
 * Lifecycle:
 *   1. requestOtp(phone): generate code, hash it, store, SMS to user.
 *   2. verifyOtp(phone, code): find latest unconsumed OTP, compare, mark used.
 *
 * Security:
 *  - Code is 6 digits (1 in 1M guess rate). Hashed at rest with sha256+pepper.
 *  - 5 verify attempts per OTP, then it locks.
 *  - 5 OTP requests per phone per 30 minutes (rate-limit).
 *  - 10-minute expiry.
 *  - Old unconsumed OTPs for the same phone are invalidated on new request.
 */

import { createHash, randomInt } from "node:crypto";
import { prisma } from "../db/client";
import { sendSms } from "./notifications";
import { logger } from "../lib/logger";
import { consume } from "../lib/rate-limit";
import { AuthError, ValidationError } from "../lib/errors";
import { isValidE164 } from "../lib/phone";

const OTP_TTL_MS = 10 * 60 * 1000;
const MAX_VERIFY_ATTEMPTS = 5;
const REQUEST_LIMIT = 5;
const REQUEST_WINDOW_MS = 30 * 60 * 1000;

function pepper(): string {
  return process.env.JWT_SECRET ?? "dev-pepper-change-me-in-prod";
}

function hashCode(code: string, phone: string): string {
  return createHash("sha256").update(`${pepper()}:${phone}:${code}`).digest("hex");
}

function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export interface RequestOtpResult {
  expiresAt: string;
  /** Only populated in non-production for testing. */
  devCode?: string;
}

export async function requestOtp(phoneE164: string): Promise<RequestOtpResult> {
  if (!isValidE164(phoneE164)) {
    throw new ValidationError(`Invalid phone: ${phoneE164}`);
  }
  consume(`otp-req:${phoneE164}`, REQUEST_LIMIT, REQUEST_WINDOW_MS);

  // Invalidate older unconsumed OTPs for this phone.
  await prisma.otpAttempt.updateMany({
    where: { phoneE164, consumedAt: null, expiresAt: { gt: new Date() } },
    data: { expiresAt: new Date() },
  });

  const code = generateCode();
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);
  await prisma.otpAttempt.create({
    data: { phoneE164, codeHash: hashCode(code, phoneE164), expiresAt },
  });

  // SMS body — tight (160 char SMS segment limit, sender ID prefixed).
  // Production: includes sender ID "NURU" via Africa's Talking.
  await sendSms(
    phoneE164,
    `Nuru: Your verification code is ${code}. Expires in 10 minutes. Never share this code.`,
  ).catch((e) => logger.error({ err: e }, "otp sms failed"));

  // In dev / sandbox without AT key, return the code so testers can proceed.
  const devCode = process.env.NODE_ENV !== "production" && !process.env.AT_API_KEY ? code : undefined;
  return { expiresAt: expiresAt.toISOString(), devCode };
}

export interface VerifyOtpResult {
  userId: string;
  isNewUser: boolean;
}

export async function verifyOtp(phoneE164: string, code: string): Promise<VerifyOtpResult> {
  if (!isValidE164(phoneE164)) throw new ValidationError(`Invalid phone: ${phoneE164}`);
  if (!/^\d{6}$/.test(code)) throw new ValidationError("Code must be 6 digits");

  const otp = await prisma.otpAttempt.findFirst({
    where: { phoneE164, consumedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!otp) throw new AuthError("Code expired or not requested");
  if (otp.attempts >= MAX_VERIFY_ATTEMPTS) throw new AuthError("Too many attempts; request a new code");

  if (otp.codeHash !== hashCode(code, phoneE164)) {
    await prisma.otpAttempt.update({
      where: { id: otp.id },
      data: { attempts: { increment: 1 } },
    });
    throw new AuthError("Invalid code");
  }

  await prisma.otpAttempt.update({
    where: { id: otp.id },
    data: { consumedAt: new Date() },
  });

  // Upsert user — phone is the primary identity.
  let user = await prisma.user.findUnique({ where: { phoneE164 } });
  let isNewUser = false;
  if (!user) {
    user = await prisma.user.create({ data: { phoneE164 } });
    isNewUser = true;
  }
  return { userId: user.id, isNewUser };
}
