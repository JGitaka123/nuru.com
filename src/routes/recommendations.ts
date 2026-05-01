/**
 * Recommendation routes.
 *
 *   GET /v1/listings/:id/similar              — semantic neighbors
 *   GET /v1/recommendations                   — personalized for the auth'd user
 *   GET /v1/listings/:id/market               — price band + comparison
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../lib/auth";
import { prisma } from "../db/client";
import { similarListings, recommendedForUser } from "../services/recommendations";
import { priceComparison } from "../services/market-intel";
import { NotFoundError, ValidationError } from "../lib/errors";

const IdParam = z.object({ id: z.string().min(1) });

export async function recommendationRoutes(app: FastifyInstance) {
  app.get("/v1/listings/:id/similar", async (req, reply) => {
    const { id } = IdParam.parse(req.params);
    const k = z.coerce.number().int().min(1).max(20).default(6).parse(
      (req.query as Record<string, unknown>).k ?? 6,
    );
    const items = await similarListings(id, k);
    return reply.send({ items });
  });

  app.get(
    "/v1/recommendations",
    { preHandler: requireAuth },
    async (req, reply) => {
      if (!req.user) throw new ValidationError("No session");
      const k = z.coerce.number().int().min(1).max(24).default(12).parse(
        (req.query as Record<string, unknown>).k ?? 12,
      );
      const items = await recommendedForUser(req.user.sub, k);
      return reply.send({ items });
    },
  );

  app.get("/v1/listings/:id/market", async (req, reply) => {
    const { id } = IdParam.parse(req.params);
    const listing = await prisma.listing.findUnique({
      where: { id },
      select: { neighborhood: true, category: true, bedrooms: true, rentKesCents: true },
    });
    if (!listing) throw new NotFoundError("Listing");
    const cmp = await priceComparison({
      neighborhood: listing.neighborhood,
      category: listing.category,
      bedrooms: listing.bedrooms,
      rentKesCents: listing.rentKesCents,
    });
    return reply.send(cmp);
  });
}
