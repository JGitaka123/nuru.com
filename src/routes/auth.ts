/**
 * Auth routes - phone or email OTP.
 *   POST /v1/auth/otp/request     { phone }
 *   POST /v1/auth/otp/verify      { phone, code, name?, role? }   -> { token, user }
 *   POST /v1/auth/email/request   { email }
 *   POST /v1/auth/email/verify    { email, code, name?, role? }   -> { token, user }
 *   PATCH /v1/auth/me             { name?, role? }                -> current user
 *   GET   /v1/auth/me                                             -> current user
 */

import type { FastifyInstance } from "fastify";
import type { User, AgentProfile } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db/client";
import { toE164 } from "../lib/phone";
import { requireAuth, signToken } from "../lib/auth";
import { ValidationError } from "../lib/errors";
import { requestEmailOtp, requestOtp, verifyEmailOtp, verifyOtp } from "../services/otp";

const RequestSchema = z.object({ phone: z.string().min(7).max(20) });
const EmailRequestSchema = z.object({ email: z.string().trim().email().max(254) });
const ProfileSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  role: z.enum(["TENANT", "AGENT", "LANDLORD"]).optional(),
});
const VerifySchema = z.object({
  phone: z.string().min(7).max(20),
  code: z.string().regex(/^\d{6}$/, "Code must be 6 digits"),
}).merge(ProfileSchema);
const EmailVerifySchema = z.object({
  email: z.string().trim().email().max(254),
  code: z.string().regex(/^\d{6}$/, "Code must be 6 digits"),
}).merge(ProfileSchema);

type CurrentUser = User & { agentProfile: AgentProfile | null };

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
    const user = await finalizeVerifiedUser(userId, isNewUser, body);
    return reply.send(signInResponse(user, isNewUser));
  });

  app.post("/v1/auth/email/request", async (req, reply) => {
    const { email } = EmailRequestSchema.parse(req.body);
    const result = await requestEmailOtp(email);
    return reply.send(result);
  });

  app.post("/v1/auth/email/verify", async (req, reply) => {
    const body = EmailVerifySchema.parse(req.body);
    const { userId, isNewUser } = await verifyEmailOtp(body.email, body.code);
    const user = await finalizeVerifiedUser(userId, isNewUser, body);
    return reply.send(signInResponse(user, isNewUser));
  });

  app.patch("/v1/auth/me", { preHandler: requireAuth }, async (req, reply) => {
    if (!req.user) throw new ValidationError("No session");
    const body = ProfileSchema.parse(req.body);
    const user = await prisma.user.update({
      where: { id: req.user.sub },
      data: {
        ...(body.name ? { name: body.name } : {}),
        ...(body.role ? { role: body.role } : {}),
      },
      include: { agentProfile: true },
    });

    return reply.send({
      token: signToken({ sub: user.id, role: user.role }),
      user: currentUserResponse(user),
    });
  });

  app.get("/v1/auth/me", { preHandler: requireAuth }, async (req, reply) => {
    if (!req.user) throw new ValidationError("No session");
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: req.user.sub },
      include: { agentProfile: true },
    });
    return reply.send(currentUserResponse(user));
  });
}

async function finalizeVerifiedUser(
  userId: string,
  isNewUser: boolean,
  profile: z.infer<typeof ProfileSchema>,
): Promise<User> {
  if (isNewUser && (profile.name || profile.role)) {
    return prisma.user.update({
      where: { id: userId },
      data: {
        ...(profile.name ? { name: profile.name } : {}),
        ...(profile.role ? { role: profile.role } : {}),
      },
    });
  }
  return prisma.user.findUniqueOrThrow({ where: { id: userId } });
}

function signInResponse(user: User, isNewUser: boolean) {
  const token = signToken({ sub: user.id, role: user.role });
  return {
    token,
    user: {
      id: user.id,
      role: user.role,
      name: user.name,
      phoneE164: user.phoneE164,
      email: user.email,
    },
    isNewUser,
  };
}

function currentUserResponse(user: CurrentUser) {
  return {
    id: user.id,
    role: user.role,
    name: user.name,
    phoneE164: user.phoneE164,
    email: user.email,
    preferredLang: user.preferredLang,
    verificationStatus: user.verificationStatus,
    agentProfile: user.agentProfile,
  };
}
