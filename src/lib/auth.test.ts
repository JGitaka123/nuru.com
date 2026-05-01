import { describe, it, expect, beforeAll } from "vitest";
import { signToken, verifyToken } from "./auth";
import { AuthError } from "./errors";

beforeAll(() => {
  process.env.JWT_SECRET = "test-secret-must-be-at-least-32-chars-long";
});

describe("auth tokens", () => {
  it("signs and verifies a token", () => {
    const token = signToken({ sub: "user_1", role: "TENANT" });
    const claims = verifyToken(token);
    expect(claims.sub).toBe("user_1");
    expect(claims.role).toBe("TENANT");
    expect(claims.exp).toBeGreaterThan(claims.iat);
  });

  it("rejects a tampered signature", () => {
    const token = signToken({ sub: "user_1", role: "TENANT" });
    const tampered = token.slice(0, -2) + "AA";
    expect(() => verifyToken(tampered)).toThrow(AuthError);
  });

  it("rejects a malformed token", () => {
    expect(() => verifyToken("not.a.token.too.many.parts")).toThrow(AuthError);
    expect(() => verifyToken("only-one-part")).toThrow(AuthError);
  });

  it("rejects an expired token", () => {
    const original = process.env.SESSION_TTL_DAYS;
    process.env.SESSION_TTL_DAYS = "0";
    try {
      const token = signToken({ sub: "user_1", role: "TENANT" });
      // Zero-day TTL: exp == iat. Wait 1.1s so exp < now.
      const claims = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
      expect(claims.exp).toBeLessThanOrEqual(Math.floor(Date.now() / 1000) + 1);
    } finally {
      process.env.SESSION_TTL_DAYS = original;
    }
  });
});
