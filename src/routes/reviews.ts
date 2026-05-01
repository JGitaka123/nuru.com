/**
 * Review routes.
 *
 *   POST   /v1/reviews                          (auth) submit/update
 *   GET    /v1/listings/:id/reviews             list + summary
 *   GET    /v1/users/:id/reviews?kind=AGENT     list + summary for an agent or tenant
 *   POST   /v1/admin/reviews/:id/hide           (admin)
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth, requireRole } from "../lib/auth";
import {
  submitReview, listForListing, listForUser, summary, hideReview,
  ReviewInputSchema,
} from "../services/reviews";

export async function reviewRoutes(app: FastifyInstance) {
  app.post(
    "/v1/reviews",
    { preHandler: requireAuth },
    async (req, reply) => {
      const input = ReviewInputSchema.parse(req.body);
      const r = await submitReview(req.user!.sub, input);
      return reply.code(201).send(r);
    },
  );

  app.get("/v1/listings/:id/reviews", async (req, reply) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
    const [items, sum] = await Promise.all([
      listForListing(id),
      summary({ kind: "LISTING", targetListingId: id }),
    ]);
    return reply.send({ items, summary: sum });
  });

  app.get("/v1/users/:id/reviews", async (req, reply) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
    const { kind } = z.object({ kind: z.enum(["AGENT", "TENANT"]).default("AGENT") }).parse(req.query);
    const [items, sum] = await Promise.all([
      listForUser(id, kind),
      summary({ kind, targetUserId: id }),
    ]);
    return reply.send({ items, summary: sum });
  });

  app.post(
    "/v1/admin/reviews/:id/hide",
    { preHandler: requireRole("ADMIN") },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
      const r = await hideReview(id, req.user!.sub);
      return reply.send(r);
    },
  );
}
