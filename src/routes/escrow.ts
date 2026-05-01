/**
 * Escrow / deposit routes.
 *   POST /v1/escrow/initiate     (tenant)  start STK push for a lease
 *   POST /v1/escrow/:id/confirm  (tenant)  confirm move-in → release to landlord
 *   GET  /v1/escrow/:id          (party)   read state
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db/client";
import { requireAuth, requireRole } from "../lib/auth";
import { initiateDeposit, confirmMoveIn } from "../services/escrow";
import { ForbiddenError, NotFoundError, ValidationError } from "../lib/errors";

const InitiateBody = z.object({
  leaseId: z.string().min(1),
});

export async function escrowRoutes(app: FastifyInstance) {
  app.post(
    "/v1/escrow/initiate",
    { preHandler: requireRole("TENANT", "ADMIN") },
    async (req, reply) => {
      const { leaseId } = InitiateBody.parse(req.body);
      if (!req.user) throw new ValidationError("No session");

      const lease = await prisma.lease.findUnique({
        where: { id: leaseId },
        include: { tenant: { select: { phoneE164: true } } },
      });
      if (!lease) throw new NotFoundError("Lease");
      if (lease.tenantId !== req.user.sub && req.user.role !== "ADMIN") {
        throw new ForbiddenError("Not your lease");
      }

      const result = await initiateDeposit({
        leaseId,
        tenantPhoneE164: lease.tenant.phoneE164,
        depositKesCents: lease.depositKesCents,
      });
      return reply.send(result);
    },
  );

  app.post(
    "/v1/escrow/:id/confirm",
    { preHandler: requireRole("TENANT", "ADMIN") },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
      if (!req.user) throw new ValidationError("No session");
      const result = await confirmMoveIn(id, req.user.sub);
      return reply.send(result);
    },
  );

  app.get(
    "/v1/escrow/:id",
    { preHandler: requireAuth },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
      if (!req.user) throw new ValidationError("No session");
      const escrow = await prisma.escrow.findUnique({
        where: { id },
        include: { lease: { select: { tenantId: true, landlordId: true } } },
      });
      if (!escrow) throw new NotFoundError("Escrow");
      const isParty =
        escrow.lease.tenantId === req.user.sub ||
        escrow.lease.landlordId === req.user.sub ||
        req.user.role === "ADMIN";
      if (!isParty) throw new ForbiddenError("Not a party to this escrow");
      return reply.send(escrow);
    },
  );
}
