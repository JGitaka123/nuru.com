/**
 * OTP auth - issue + verify 6-digit codes over phone SMS or email.
 *
 * Lifecycle:
 *   1. requestOtp(phone): generate code, hash it, store, SMS to user.
 *   2. requestEmailOtp(email): generate code, hash it, store, email to user.
 *   3. verify*: find latest unconsumed OTP, compare, mark used.
 *
 * Security:
 *  - Code is 6 digits (1 in 1M guess rate). Hashed at rest with sha256+pepper.
 *  - 5 verify attempts per OTP, then it locks.
 *  - 5 OTP requests per identity per 30 minutes (rate-limit).
 *  - 10-minute expiry.
 *  - Old unconsumed OTPs for the same identity are invalidated on new request.
 */

import { createHash, randomInt } from "node:crypto";
import { prisma } from "../db/client";
import { send } from "./email";
import { sendSms } from "./notifications";
import { logger } from "../lib/logger";
import { consume } from "../lib/rate-limit";
import { AuthError, ExternalServiceError, ValidationError } from "../lib/errors";
import { isValidE164 } from "../lib/phone";

const OTP_TTL_MS = 10 * 60 * 1000;
const MAX_VERIFY_ATTEMPTS = 5;
const REQUEST_LIMIT = 5;
const REQUEST_WINDOW_MS = 30 * 60 * 1000;

function pepper(): string {
  return process.env.JWT_SECRET ?? "dev-pepper-change-me-in-prod";
}

function hashCode(code: string, identity: string): string {
  return createHash("sha256").update(`${pepper()}:${identity}:${code}`).digest("hex");
}

function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

function normalizeEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new ValidationError("Invalid email");
  }
  return normalized;
}

export interface RequestOtpResult {
  expiresAt: string;
  /** Only populated in non-production for testing. */
  devCode?: string;
}

export interface VerifyOtpResult {
  userId: string;
  isNewUser: boolean;
}

export async function requestOtp(phoneE164: string): Promise<RequestOtpResult> {
  if (!isValidE164(phoneE164)) {
    throw new ValidationError(`Invalid phone: ${phoneE164}`);
  }
  consume(`otp-req:phone:${phoneE164}`, REQUEST_LIMIT, REQUEST_WINDOW_MS);

  await prisma.otpAttempt.updateMany({
    where: { channel: "phone", phoneE164, consumedAt: null, expiresAt: { gt: new Date() } },
    data: { expiresAt: new Date() },
  });

  const code = generateCode();
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);
  await prisma.otpAttempt.create({
    data: { channel: "phone", phoneE164, codeHash: hashCode(code, phoneE164), expiresAt },
  });

  await sendSms(
    phoneE164,
    `Nuru: Your verification code is ${code}. Expires in 10 minutes. Never share this code.`,
  ).catch((e) => logger.error({ err: e }, "otp sms failed"));

  const devCode = process.env.NODE_ENV !== "production" && !process.env.AT_API_KEY ? code : undefined;
  return { expiresAt: expiresAt.toISOString(), devCode };
}

export async function requestEmailOtp(email: string): Promise<RequestOtpResult> {
  const normalized = normalizeEmail(email);
  consume(`otp-req:email:${normalized}`, REQUEST_LIMIT, REQUEST_WINDOW_MS);

  await prisma.otpAttempt.updateMany({
    where: { channel: "email", email: normalized, consumedAt: null, expiresAt: { gt: new Date() } },
    data: { expiresAt: new Date() },
  });

  const code = generateCode();
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);
  await prisma.otpAttempt.create({
    data: { channel: "email", email: normalized, codeHash: hashCode(code, normalized), expiresAt },
  });

  const emailResult = await send({
    to: normalized,
    subject: "Your Nuru sign-in code",
    text: `Your Nuru verification code is ${code}. It expires in 10 minutes. Never share this code.`,
    tags: [{ name: "type", value: "auth_otp" }],
  }).catch((e) => {
    logger.error({ err: e }, "otp email failed");
    throw e;
  });
  if (process.env.NODE_ENV === "production" && !emailResult.sent) {
    throw new ExternalServiceError("Resend");
  }

  const devCode = process.env.NODE_ENV !== "production" && !process.env.RESEND_API_KEY ? code : undefined;
  return { expiresAt: expiresAt.toISOString(), devCode };
}

export async function verifyOtp(phoneE164: string, code: string): Promise<VerifyOtpResult> {
  if (!isValidE164(phoneE164)) throw new ValidationError(`Invalid phone: ${phoneE164}`);
  const otpId = await verifyOtpAttempt("phone", phoneE164, code);

  let user = await prisma.user.findUnique({ where: { phoneE164 } });
  let isNewUser = false;
  if (!user) {
    user = await prisma.user.create({ data: { phoneE164 } });
    isNewUser = true;
  }

  await prisma.otpAttempt.update({
    where: { id: otpId },
    data: { consumedAt: new Date() },
  });
  return { userId: user.id, isNewUser };
}

export async function verifyEmailOtp(email: string, code: string): Promise<VerifyOtpResult> {
  const normalized = normalizeEmail(email);
  const otpId = await verifyOtpAttempt("email", normalized, code);

  let user = await prisma.user.findUnique({ where: { email: normalized } });
  let isNewUser = false;
  if (!user) {
    user = await prisma.user.create({ data: { email: normalized } });
    isNewUser = true;
  }

  await prisma.otpAttempt.update({
    where: { id: otpId },
    data: { consumedAt: new Date() },
  });
  return { userId: user.id, isNewUser };
}

async function verifyOtpAttempt(channel: "phone" | "email", identity: string, code: string): Promise<string> {
  if (!/^\d{6}$/.test(code)) throw new ValidationError("Code must be 6 digits");

  const otp = await prisma.otpAttempt.findFirst({
    where: {
      channel,
      ...(channel === "phone" ? { phoneE164: identity } : { email: identity }),
      consumedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });
  if (!otp) throw new AuthError("Code expired or not requested");
  if (otp.attempts >= MAX_VERIFY_ATTEMPTS) throw new AuthError("Too many attempts; request a new code");

  if (otp.codeHash !== hashCode(code, identity)) {
    await prisma.otpAttempt.update({
      where: { id: otp.id },
      data: { attempts: { increment: 1 } },
    });
    throw new AuthError("Invalid code");
  }

  return otp.id;
}
