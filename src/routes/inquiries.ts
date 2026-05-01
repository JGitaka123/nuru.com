/**
 * Inquiry routes.
 *   POST /v1/inquiries                            (tenant) DM about a listing
 *   GET  /v1/inquiries/me                         (tenant or agent)
 *   GET  /v1/listings/:id/inquiries               (agent)
 *   POST /v1/inquiries/:id/responded              (agent) mark responded
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth, requireRole } from "../lib/auth";
import {
  createInquiry, listInquiriesForAgent, listInquiriesForListing, markResponded,
  InquiryInputSchema,
} from "../services/inquiries";
import { ValidationError } from "../lib/errors";
import { prisma } from "../db/client";

const IdParam = z.object({ id: z.string().min(1) });

export async function inquiryRoutes(app: FastifyInstance) {
  app.post(
    "/v1/inquiries",
    { preHandler: requireRole("TENANT", "ADMIN") },
    async (req, reply) => {
      const input = InquiryInputSchema.parse(req.body);
      const i = await createInquiry(req.user!.sub, input);
      return reply.code(201).send(i);
    },
  );

  app.get(
    "/v1/inquiries/me",
    { preHandler: requireAuth },
    async (req, reply) => {
      if (!req.user) throw new ValidationError("No session");
      if (req.user.role === "TENANT") {
        const items = await prisma.inquiry.findMany({
          where: { tenantId: req.user.sub },
          orderBy: { createdAt: "desc" },
          include: { listing: { select: { id: true, title: true, primaryPhotoKey: true } } },
          take: 100,
        });
        return reply.send({ items });
      }
      const items = await listInquiriesForAgent(req.user.sub);
      return reply.send({ items });
    },
  );

  app.get(
    "/v1/listings/:id/inquiries",
    { preHandler: requireRole("AGENT", "LANDLORD", "ADMIN") },
    async (req, reply) => {
      const { id } = IdParam.parse(req.params);
      const items = await listInquiriesForListing(id, req.user!.sub, req.user!.role);
      return reply.send({ items });
    },
  );

  app.post(
    "/v1/inquiries/:id/responded",
    { preHandler: requireRole("AGENT", "LANDLORD", "ADMIN") },
    async (req, reply) => {
      const { id } = IdParam.parse(req.params);
      const updated = await markResponded(id, req.user!.sub, req.user!.role);
      return reply.send(updated);
    },
  );
}
