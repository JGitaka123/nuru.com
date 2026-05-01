/**
 * JWT session helpers + Fastify auth preHandler.
 *
 * Sessions are JWTs signed with JWT_SECRET. We store nothing server-side
 * beyond the User row — sessions are stateless. Logout clears client storage.
 *
 * Token TTL is SESSION_TTL_DAYS (default 30). Long sessions are fine because
 * (a) phone numbers are slow to compromise, (b) the auth flow already requires
 * an OTP, (c) Kenyan users on flaky connections hate re-logging-in.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { UserRole } from "@prisma/client";
import { AuthError, ForbiddenError } from "./errors";

export interface SessionClaims {
  sub: string;        // user id
  role: UserRole;
  iat: number;        // issued at (seconds since epoch)
  exp: number;        // expires at (seconds since epoch)
}

const SECRET = () => {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 32) {
    throw new Error("JWT_SECRET must be set and at least 32 characters");
  }
  return s;
};

const TTL_SECONDS = () =>
  Number(process.env.SESSION_TTL_DAYS ?? 30) * 24 * 60 * 60;

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function sign(payload: string): string {
  return createHmac("sha256", SECRET()).update(payload).digest("base64url");
}

export function signToken(claims: Pick<SessionClaims, "sub" | "role">): string {
  const now = Math.floor(Date.now() / 1000);
  const full: SessionClaims = { ...claims, iat: now, exp: now + TTL_SECONDS() };
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(full));
  const sig = sign(`${header}.${body}`);
  return `${header}.${body}.${sig}`;
}

export function verifyToken(token: string): SessionClaims {
  const parts = token.split(".");
  if (parts.length !== 3) throw new AuthError("Malformed token");
  const [header, body, sig] = parts;

  const expected = Buffer.from(sign(`${header}.${body}`));
  const actual = Buffer.from(sig);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw new AuthError("Invalid token signature");
  }

  let claims: SessionClaims;
  try {
    claims = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    throw new AuthError("Invalid token body");
  }

  if (typeof claims.exp !== "number" || claims.exp < Math.floor(Date.now() / 1000)) {
    throw new AuthError("Token expired");
  }
  return claims;
}

declare module "fastify" {
  interface FastifyRequest {
    user?: SessionClaims;
  }
}

/**
 * preHandler that requires a valid bearer token. Use as
 *   app.get("/protected", { preHandler: requireAuth }, ...)
 */
export async function requireAuth(req: FastifyRequest, _reply: FastifyReply) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    throw new AuthError("Missing bearer token");
  }
  req.user = verifyToken(header.slice(7));
}

/** preHandler that also checks role. */
export function requireRole(...roles: UserRole[]) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    await requireAuth(req, reply);
    if (!req.user || !roles.includes(req.user.role)) {
      throw new ForbiddenError(`Requires role: ${roles.join(" or ")}`);
    }
  };
}
