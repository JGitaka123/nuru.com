/**
 * Application routes.
 *   POST /v1/applications                       (tenant) submit
 *   GET  /v1/applications/me                    (tenant) my apps
 *   GET  /v1/listings/:id/applications          (agent)  apps on my listing
 *   GET  /v1/applications/:id                   (party)
 *   POST /v1/applications/:id/decide            (agent)  approve/reject
 *   POST /v1/applications/:id/withdraw          (tenant) withdraw
 *   POST /v1/applications/:id/rescreen          (party)  re-run AI screen
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth, requireRole } from "../lib/auth";
import {
  submitApplication, listApplicationsForListing, listApplicationsForTenant,
  getApplication, decideApplication, withdrawApplication, rescreenApplication,
  ApplicationInputSchema,
} from "../services/applications";
import { ValidationError } from "../lib/errors";

const IdParam = z.object({ id: z.string().min(1) });

export async function applicationRoutes(app: FastifyInstance) {
  app.post(
    "/v1/applications",
    { preHandler: requireRole("TENANT", "ADMIN") },
    async (req, reply) => {
      const input = ApplicationInputSchema.parse(req.body);
      const a = await submitApplication(req.user!.sub, input);
      return reply.code(201).send(a);
    },
  );

  app.get(
    "/v1/applications/me",
    { preHandler: requireRole("TENANT", "ADMIN") },
    async (req, reply) => {
      const items = await listApplicationsForTenant(req.user!.sub);
      return reply.send({ items });
    },
  );

  app.get(
    "/v1/listings/:id/applications",
    { preHandler: requireRole("AGENT", "LANDLORD", "ADMIN") },
    async (req, reply) => {
      const { id } = IdParam.parse(req.params);
      const items = await listApplicationsForListing(id, req.user!.sub, req.user!.role);
      return reply.send({ items });
    },
  );

  app.get(
    "/v1/applications/:id",
    { preHandler: requireAuth },
    async (req, reply) => {
      const { id } = IdParam.parse(req.params);
      if (!req.user) throw new ValidationError("No session");
      const a = await getApplication(id, req.user.sub, req.user.role);
      return reply.send(a);
    },
  );

  app.post(
    "/v1/applications/:id/decide",
    { preHandler: requireRole("AGENT", "LANDLORD", "ADMIN") },
    async (req, reply) => {
      const { id } = IdParam.parse(req.params);
      const { decision } = z.object({ decision: z.enum(["APPROVED", "REJECTED"]) }).parse(req.body);
      const a = await decideApplication(id, req.user!.sub, req.user!.role, decision);
      return reply.send(a);
    },
  );

  app.post(
    "/v1/applications/:id/withdraw",
    { preHandler: requireRole("TENANT", "ADMIN") },
    async (req, reply) => {
      const { id } = IdParam.parse(req.params);
      const a = await withdrawApplication(id, req.user!.sub);
      return reply.send(a);
    },
  );

  app.post(
    "/v1/applications/:id/rescreen",
    { preHandler: requireAuth },
    async (req, reply) => {
      const { id } = IdParam.parse(req.params);
      if (!req.user) throw new ValidationError("No session");
      const a = await rescreenApplication(id, req.user.sub, req.user.role);
      return reply.send(a);
    },
  );
}
