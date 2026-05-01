/**
 * Saved listings (favorites).
 *
 *   POST   /v1/saved              { listingId, notes? }
 *   DELETE /v1/saved/:listingId
 *   GET    /v1/saved
 *   GET    /v1/listings/:id/saved-count   — public, for "X people saved this"
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../lib/auth";
import { saveListing, unsaveListing, listSaved, saveCount, SaveSchema } from "../services/saved-listings";
import { ValidationError } from "../lib/errors";

export async function savedRoutes(app: FastifyInstance) {
  app.post(
    "/v1/saved",
    { preHandler: requireAuth },
    async (req, reply) => {
      const input = SaveSchema.parse(req.body);
      if (!req.user) throw new ValidationError("No session");
      const r = await saveListing(req.user.sub, input);
      return reply.code(201).send(r);
    },
  );

  app.delete(
    "/v1/saved/:listingId",
    { preHandler: requireAuth },
    async (req, reply) => {
      const { listingId } = z.object({ listingId: z.string().min(1) }).parse(req.params);
      if (!req.user) throw new ValidationError("No session");
      await unsaveListing(req.user.sub, listingId);
      return reply.code(204).send();
    },
  );

  app.get(
    "/v1/saved",
    { preHandler: requireAuth },
    async (req, reply) => {
      if (!req.user) throw new ValidationError("No session");
      const items = await listSaved(req.user.sub);
      return reply.send({ items });
    },
  );

  app.get("/v1/listings/:id/saved-count", async (req, reply) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
    const count = await saveCount(id);
    return reply.send({ count });
  });
}
