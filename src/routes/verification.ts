/**
 * Verification routes.
 *   POST /v1/verification/tenant   (tenant)        submit ID
 *   POST /v1/verification/agent    (agent/landlord) submit ID + KRA
 *   POST /v1/verification/:userId/review  (admin)  approve/reject
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireRole } from "../lib/auth";
import {
  submitTenantVerification, submitAgentVerification, reviewVerification,
  TenantVerificationSchema, AgentVerificationSchema,
} from "../services/verification";

export async function verificationRoutes(app: FastifyInstance) {
  app.post(
    "/v1/verification/tenant",
    { preHandler: requireRole("TENANT", "ADMIN") },
    async (req, reply) => {
      const input = TenantVerificationSchema.parse(req.body);
      const result = await submitTenantVerification(req.user!.sub, input);
      return reply.send(result);
    },
  );

  app.post(
    "/v1/verification/agent",
    { preHandler: requireRole("AGENT", "LANDLORD", "ADMIN") },
    async (req, reply) => {
      const input = AgentVerificationSchema.parse(req.body);
      const result = await submitAgentVerification(req.user!.sub, input);
      return reply.send(result);
    },
  );

  app.post(
    "/v1/verification/:userId/review",
    { preHandler: requireRole("ADMIN") },
    async (req, reply) => {
      const { userId } = z.object({ userId: z.string().min(1) }).parse(req.params);
      const { decision } = z
        .object({ decision: z.enum(["VERIFIED", "REJECTED"]) })
        .parse(req.body);
      const result = await reviewVerification(userId, decision);
      return reply.send(result);
    },
  );
}
