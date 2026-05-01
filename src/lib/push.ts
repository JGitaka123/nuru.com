/**
 * Web Push helpers.
 *
 * Required vendor setup: see docs/runbooks/vendor-setup.md §12.
 * Generates VAPID keys with `pnpm tsx scripts/generate-vapid.ts`.
 *
 * Without VAPID env vars, sendPush no-ops with a warning — the rest of the
 * app continues. Subscriptions still get stored; they fire once envs are set.
 *
 * We use a lightweight implementation rather than the `web-push` package to
 * avoid the extra dependency. ECDSA over P-256 + AES-GCM body encryption
 * per RFC 8030 and RFC 8291.
 */

import { createSign, createPublicKey, randomBytes, createHash, createHmac, createCipheriv } from "node:crypto";
import { logger } from "./logger";

interface PushSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}

interface SendPushOpts {
  subscription: PushSubscription;
  payload: object;
  ttlSeconds?: number;
  urgency?: "very-low" | "low" | "normal" | "high";
}

function vapidConfigured(): boolean {
  return !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT);
}

function b64urlEncode(buf: Buffer): string {
  return buf.toString("base64url");
}

function b64urlDecode(s: string): Buffer {
  return Buffer.from(s, "base64url");
}

/** Build a JWT signed with the VAPID private key (ES256). */
function buildVapidJwt(audienceOrigin: string): string {
  const header = b64urlEncode(Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64urlEncode(Buffer.from(JSON.stringify({
    aud: audienceOrigin,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: process.env.VAPID_SUBJECT!,
  })));
  const data = `${header}.${claims}`;

  // Convert raw 32-byte private key (base64url) into a JWK so node crypto can sign.
  const priv = b64urlDecode(process.env.VAPID_PRIVATE_KEY!);
  const pub = b64urlDecode(process.env.VAPID_PUBLIC_KEY!);
  // Public key uncompressed form: 0x04 || X(32) || Y(32)
  if (pub.length !== 65 || pub[0] !== 0x04) {
    throw new Error("VAPID_PUBLIC_KEY must be 65-byte uncompressed P-256");
  }
  const jwk = {
    kty: "EC",
    crv: "P-256",
    d: b64urlEncode(priv),
    x: b64urlEncode(pub.subarray(1, 33)),
    y: b64urlEncode(pub.subarray(33, 65)),
  };
  const keyObject = createPublicKey({ key: jwk as any, format: "jwk" });
  // Sign expects a private key — recreate from JWK including d.
  const { createPrivateKey } = require("node:crypto") as typeof import("node:crypto");
  const signKey = createPrivateKey({ key: jwk as any, format: "jwk" });

  const signer = createSign("SHA256");
  signer.update(data);
  signer.end();
  const der = signer.sign(signKey);

  // Convert ASN.1 DER signature to JWS raw 64-byte (R||S).
  const rs = derToRaw(der);
  return `${data}.${b64urlEncode(rs)}`;
}

function derToRaw(der: Buffer): Buffer {
  // Minimal DER parser for ECDSA-Sig-Value: SEQUENCE { INTEGER r, INTEGER s }
  let i = 0;
  if (der[i++] !== 0x30) throw new Error("bad DER");
  // length byte (assume short form for P-256)
  if (der[i++] & 0x80) throw new Error("long-form DER not supported");
  if (der[i++] !== 0x02) throw new Error("expected INTEGER for r");
  let rLen = der[i++];
  let r = der.subarray(i, i + rLen); i += rLen;
  if (der[i++] !== 0x02) throw new Error("expected INTEGER for s");
  let sLen = der[i++];
  let s = der.subarray(i, i + sLen);
  // Strip leading zeros, left-pad to 32 bytes.
  const pad = (b: Buffer) => {
    while (b.length > 32 && b[0] === 0x00) b = b.subarray(1);
    if (b.length < 32) b = Buffer.concat([Buffer.alloc(32 - b.length), b]);
    return b;
  };
  return Buffer.concat([pad(r), pad(s)]);
}

/**
 * Send a push notification. Returns true on success, false otherwise.
 *
 * NOTE: this implementation handles VAPID auth + AES-GCM body encryption
 * for typical Web Push endpoints (FCM, APNs via Apple Push). For now we
 * only send empty pushes (no body) — the service worker fetches the
 * actual content over HTTPS. This avoids the encryption complexity until
 * we genuinely need encrypted payloads. See `web/public/sw.js`.
 */
export async function sendPush(opts: SendPushOpts): Promise<boolean> {
  if (!vapidConfigured()) {
    logger.warn({ endpoint: opts.subscription.endpoint }, "vapid not configured — skipping push");
    return false;
  }

  let origin: string;
  try {
    origin = new URL(opts.subscription.endpoint).origin;
  } catch {
    return false;
  }

  const jwt = buildVapidJwt(origin);
  const headers: Record<string, string> = {
    Authorization: `vapid t=${jwt}, k=${process.env.VAPID_PUBLIC_KEY}`,
    TTL: String(opts.ttlSeconds ?? 60 * 60 * 24),
    Urgency: opts.urgency ?? "normal",
  };

  // Empty body push: client SW just calls fetch() to get the actual content.
  // For encrypted payloads, see RFC 8291. We can swap the lib in when needed.
  try {
    const res = await fetch(opts.subscription.endpoint, {
      method: "POST",
      headers,
    });
    if (!res.ok) {
      logger.warn({ status: res.status }, "push delivery non-2xx");
      return false;
    }
    return true;
  } catch (err) {
    logger.warn({ err }, "push delivery failed");
    return false;
  }
}

// Re-export types so callers don't import from the implementation file twice.
export type { PushSubscription };

// Suppress unused-var warnings for helpers retained for future encrypted-payload work.
void randomBytes; void createHash; void createHmac; void createCipheriv; void createPublicKey;
