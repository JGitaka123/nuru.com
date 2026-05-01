/**
 * Saved-search routes.
 *   POST   /v1/saved-searches              create
 *   GET    /v1/saved-searches              list mine
 *   POST   /v1/saved-searches/:id/active   toggle active
 *   DELETE /v1/saved-searches/:id          remove
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../lib/auth";
import {
  createSavedSearch, listSavedSearches, deleteSavedSearch, setSavedSearchActive,
  SavedSearchInputSchema,
} from "../services/saved-searches";
import { ValidationError } from "../lib/errors";

export async function savedSearchRoutes(app: FastifyInstance) {
  app.post(
    "/v1/saved-searches",
    { preHandler: requireAuth },
    async (req, reply) => {
      if (!req.user) throw new ValidationError("No session");
      const input = SavedSearchInputSchema.parse(req.body);
      const ss = await createSavedSearch(req.user.sub, input);
      return reply.code(201).send(ss);
    },
  );

  app.get(
    "/v1/saved-searches",
    { preHandler: requireAuth },
    async (req, reply) => {
      if (!req.user) throw new ValidationError("No session");
      const items = await listSavedSearches(req.user.sub);
      return reply.send({ items });
    },
  );

  app.post(
    "/v1/saved-searches/:id/active",
    { preHandler: requireAuth },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
      const { isActive } = z.object({ isActive: z.boolean() }).parse(req.body);
      if (!req.user) throw new ValidationError("No session");
      const ss = await setSavedSearchActive(req.user.sub, id, isActive);
      return reply.send(ss);
    },
  );

  app.delete(
    "/v1/saved-searches/:id",
    { preHandler: requireAuth },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
      if (!req.user) throw new ValidationError("No session");
      await deleteSavedSearch(req.user.sub, id);
      return reply.code(204).send();
    },
  );
}
