/**
 * Lease routes.
 *   GET  /v1/leases/me                  (tenant or landlord)
 *   GET  /v1/leases/:id                 (party)
 *   POST /v1/leases/:id/sign            (party) record signature
 *   POST /v1/leases/:id/dispute         (party) flag dispute (escrow stays HELD)
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../lib/auth";
import { getLease, listMyLeases, signLease, disputeLease } from "../services/leases";
import { ValidationError } from "../lib/errors";

const IdParam = z.object({ id: z.string().min(1) });

export async function leaseRoutes(app: FastifyInstance) {
  app.get(
    "/v1/leases/me",
    { preHandler: requireAuth },
    async (req, reply) => {
      if (!req.user) throw new ValidationError("No session");
      const items = await listMyLeases(req.user.sub, req.user.role);
      return reply.send({ items });
    },
  );

  app.get(
    "/v1/leases/:id",
    { preHandler: requireAuth },
    async (req, reply) => {
      const { id } = IdParam.parse(req.params);
      if (!req.user) throw new ValidationError("No session");
      const lease = await getLease(id, req.user.sub, req.user.role);
      return reply.send(lease);
    },
  );

  app.post(
    "/v1/leases/:id/sign",
    { preHandler: requireAuth },
    async (req, reply) => {
      const { id } = IdParam.parse(req.params);
      if (!req.user) throw new ValidationError("No session");
      const lease = await signLease(id, req.user.sub, req.user.role);
      return reply.send(lease);
    },
  );

  app.post(
    "/v1/leases/:id/dispute",
    { preHandler: requireAuth },
    async (req, reply) => {
      const { id } = IdParam.parse(req.params);
      const { reason } = z.object({ reason: z.string().min(10).max(2000) }).parse(req.body);
      if (!req.user) throw new ValidationError("No session");
      const lease = await disputeLease(id, req.user.sub, reason);
      return reply.send(lease);
    },
  );
}
