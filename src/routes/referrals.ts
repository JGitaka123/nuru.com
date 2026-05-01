/**
 * Referral routes.
 *
 *   GET  /v1/referrals/me                     (auth) my code + redemptions
 *   POST /v1/referrals/redeem                 { code } — redeem (call once after signup)
 */

import type { FastifyInstance } from "fastify";
import { requireAuth } from "../lib/auth";
import { listMine, redeemForSignup, RedeemSchema } from "../services/referrals";

export async function referralRoutes(app: FastifyInstance) {
  app.get(
    "/v1/referrals/me",
    { preHandler: requireAuth },
    async (req, reply) => {
      const r = await listMine(req.user!.sub);
      return reply.send(r);
    },
  );

  app.post(
    "/v1/referrals/redeem",
    { preHandler: requireAuth },
    async (req, reply) => {
      const { code } = RedeemSchema.parse(req.body);
      const r = await redeemForSignup(req.user!.sub, code);
      return reply.code(201).send(r);
    },
  );
}
