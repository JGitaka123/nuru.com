/**
 * Integration test for the OTP auth flow. Requires:
 *   - DATABASE_URL pointing at a test DB (the suite truncates between cases)
 *   - Migrations applied (`pnpm db:deploy`)
 *
 * Run: pnpm test:integration src/routes/auth.int.test.ts
 *
 * Skipped when SKIP_INT_TESTS=1 or no DATABASE_URL.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { PrismaClient } from "@prisma/client";
import { authRoutes } from "./auth";

const skip = !process.env.DATABASE_URL || process.env.SKIP_INT_TESTS === "1";

describe.skipIf(skip)("auth integration", () => {
  let app: FastifyInstance;
  let prisma: PrismaClient;

  beforeAll(async () => {
    process.env.JWT_SECRET ??= "integration-secret-must-be-at-least-32-chars";
    process.env.AT_API_KEY = "";   // force devCode path
    prisma = new PrismaClient();
    app = Fastify();
    await app.register(authRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.otpAttempt.deleteMany({ where: { phoneE164: { startsWith: "+25470" } } });
    await prisma.user.deleteMany({ where: { phoneE164: { startsWith: "+25470" } } });
  });

  it("issues, verifies, and creates a session", async () => {
    const phone = "+254700000099";

    const reqRes = await app.inject({
      method: "POST",
      url: "/v1/auth/otp/request",
      payload: { phone },
    });
    expect(reqRes.statusCode).toBe(200);
    const reqJson = reqRes.json() as { devCode?: string };
    expect(reqJson.devCode).toMatch(/^\d{6}$/);

    const verifyRes = await app.inject({
      method: "POST",
      url: "/v1/auth/otp/verify",
      payload: { phone, code: reqJson.devCode },
    });
    expect(verifyRes.statusCode).toBe(200);
    const verifyJson = verifyRes.json() as { token: string; user: { id: string }; isNewUser: boolean };
    expect(verifyJson.token).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);
    expect(verifyJson.isNewUser).toBe(true);
    expect(verifyJson.user.id).toBeTruthy();
  });

  it("rejects an invalid code and locks after 5 attempts", async () => {
    const phone = "+254700000098";
    await app.inject({ method: "POST", url: "/v1/auth/otp/request", payload: { phone } });

    for (let i = 0; i < 5; i++) {
      const r = await app.inject({
        method: "POST",
        url: "/v1/auth/otp/verify",
        payload: { phone, code: "000000" },
      });
      expect(r.statusCode).toBe(401);
    }
    // 6th attempt: locked.
    const r = await app.inject({
      method: "POST",
      url: "/v1/auth/otp/verify",
      payload: { phone, code: "000000" },
    });
    expect(r.statusCode).toBe(401);
  });
});
