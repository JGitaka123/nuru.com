/**
 * Generate a VAPID keypair for Web Push.
 *
 * Run: pnpm tsx scripts/generate-vapid.ts
 *
 * Copy the printed values into your env:
 *   VAPID_PUBLIC_KEY=<public>      → also set NEXT_PUBLIC_VAPID_PUBLIC_KEY in web/.env
 *   VAPID_PRIVATE_KEY=<private>
 *   VAPID_SUBJECT=mailto:ops@nuru.com
 *
 * The keys are P-256 ECDH per RFC 8292. The public key is uncompressed
 * (65 bytes, leading 0x04).
 */

import { generateKeyPairSync } from "node:crypto";

const { publicKey, privateKey } = generateKeyPairSync("ec", {
  namedCurve: "prime256v1",
});

const pubJwk = publicKey.export({ format: "jwk" }) as { x: string; y: string };
const privJwk = privateKey.export({ format: "jwk" }) as { d: string };

// Reconstruct uncompressed public key: 0x04 || X || Y.
const x = Buffer.from(pubJwk.x, "base64url");
const y = Buffer.from(pubJwk.y, "base64url");
const pub = Buffer.concat([Buffer.from([0x04]), x, y]);

const priv = Buffer.from(privJwk.d, "base64url");

console.log("=== VAPID keypair ===");
console.log(`VAPID_PUBLIC_KEY=${pub.toString("base64url")}`);
console.log(`VAPID_PRIVATE_KEY=${priv.toString("base64url")}`);
console.log(`VAPID_SUBJECT=mailto:ops@nuru.com`);
console.log();
console.log("Also set in web/.env:");
console.log(`NEXT_PUBLIC_VAPID_PUBLIC_KEY=${pub.toString("base64url")}`);
