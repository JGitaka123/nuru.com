/**
 * Auth routes — phone OTP only.
 *   POST /v1/auth/otp/request  { phone }
 *   POST /v1/auth/otp/verify   { phone, code, name?, role? }   → { token, user }
 *   GET  /v1/auth/me                                           → current user
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db/client";
import { toE164 } from "../lib/phone";
import { signToken, requireAuth } from "../lib/auth";
import { requestOtp, verifyOtp } from "../services/otp";
import { ValidationError } from "../lib/errors";

const RequestSchema = z.object({ phone: z.string().min(7).max(20) });
const VerifySchema = z.object({
  phone: z.string().min(7).max(20),
  code: z.string().regex(/^\d{6}$/, "Code must be 6 digits"),
  name: z.string().min(1).max(100).optional(),
  role: z.enum(["TENANT", "AGENT", "LANDLORD"]).optional(),
});

export async function authRoutes(app: FastifyInstance) {
  app.post("/v1/auth/otp/request", async (req, reply) => {
    const { phone } = RequestSchema.parse(req.body);
    const e164 = toE164(phone);
    const result = await requestOtp(e164);
    return reply.send(result);
  });

  app.post("/v1/auth/otp/verify", async (req, reply) => {
    const body = VerifySchema.parse(req.body);
    const e164 = toE164(body.phone);
    const { userId, isNewUser } = await verifyOtp(e164, body.code);

    if (isNewUser && (body.name || body.role)) {
      await prisma.user.update({
        where: { id: userId },
        data: {
          ...(body.name ? { name: body.name } : {}),
          ...(body.role ? { role: body.role } : {}),
        },
      });
    }

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const token = signToken({ sub: user.id, role: user.role });
    return reply.send({
      token,
      user: { id: user.id, role: user.role, name: user.name, phoneE164: user.phoneE164 },
      isNewUser,
    });
  });

  app.get("/v1/auth/me", { preHandler: requireAuth }, async (req, reply) => {
    if (!req.user) throw new ValidationError("No session");
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: req.user.sub },
      include: { agentProfile: true },
    });
    return reply.send({
      id: user.id,
      role: user.role,
      name: user.name,
      phoneE164: user.phoneE164,
      preferredLang: user.preferredLang,
      verificationStatus: user.verificationStatus,
      agentProfile: user.agentProfile,
    });
  });
}
