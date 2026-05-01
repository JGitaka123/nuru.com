/**
 * Fraud report routes.
 *   POST /v1/reports                          (auth)  flag a listing
 *   GET  /v1/admin/reports                    (admin) review queue
 *   POST /v1/admin/reports/:id/resolve        (admin)
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth, requireRole } from "../lib/auth";
import { submitReport, listOpenReports, resolveReport, ReportSchema } from "../services/fraud-reports";

export async function fraudReportRoutes(app: FastifyInstance) {
  app.post(
    "/v1/reports",
    { preHandler: requireAuth },
    async (req, reply) => {
      const input = ReportSchema.parse(req.body);
      const r = await submitReport(req.user!.sub, input);
      return reply.code(201).send(r);
    },
  );

  app.get(
    "/v1/admin/reports",
    { preHandler: requireRole("ADMIN") },
    async (req, reply) => {
      const { limit } = z.object({ limit: z.coerce.number().int().min(1).max(200).default(50) }).parse(req.query);
      const items = await listOpenReports(limit);
      return reply.send({ items });
    },
  );

  app.post(
    "/v1/admin/reports/:id/resolve",
    { preHandler: requireRole("ADMIN") },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
      const r = await resolveReport(id, req.user!.sub);
      return reply.send(r);
    },
  );
}
