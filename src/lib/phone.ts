/**
 * Kenyan phone number handling.
 *
 * Storage format: E.164 (+254712345678) — what we put in the DB.
 * Daraja format:  254712345678 — no plus.
 * Display format: 0712 345 678 — what users type and read.
 *
 * Kenyan mobile prefixes (Safaricom + Airtel + Telkom): 7XX or 1XX.
 * After the country code, the number is 9 digits: [71]XXXXXXXX.
 */

import { ValidationError } from "./errors";

const KE_MOBILE_REGEX = /^[71]\d{8}$/;

/**
 * Normalize any reasonable Kenyan phone input to E.164.
 * Accepts: "0712345678", "712345678", "+254712345678", "254712345678",
 * "0712 345 678", "+254 712-345-678".
 */
export function toE164(input: string): string {
  const cleaned = input.replace(/[\s\-()]/g, "");
  let digits: string;

  if (cleaned.startsWith("+254")) {
    digits = cleaned.slice(4);
  } else if (cleaned.startsWith("254")) {
    digits = cleaned.slice(3);
  } else if (cleaned.startsWith("0")) {
    digits = cleaned.slice(1);
  } else {
    digits = cleaned;
  }

  if (!KE_MOBILE_REGEX.test(digits)) {
    throw new ValidationError(`Invalid Kenyan mobile number: ${input}`);
  }
  return `+254${digits}`;
}

/** Convert E.164 (+254712345678) → Daraja format (254712345678). */
export function toDarajaFormat(e164: string): string {
  if (!isValidE164(e164)) {
    throw new ValidationError(`Invalid E.164 phone: ${e164}`);
  }
  return e164.slice(1);
}

/** Display format: 0712 345 678. Strips country code, adds spaces. */
export function toDisplay(e164: string): string {
  if (!isValidE164(e164)) return e164;
  const digits = e164.slice(4);
  return `0${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
}

export function isValidE164(input: string): boolean {
  if (!input.startsWith("+254") || input.length !== 13) return false;
  return KE_MOBILE_REGEX.test(input.slice(4));
}
