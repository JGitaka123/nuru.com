/**
 * Listing CRUD routes.
 *
 *   POST   /v1/listings                          (agent only) → create draft
 *   GET    /v1/listings/me                       (agent only) → my listings
 *   GET    /v1/listings                                       → public, paginated
 *   GET    /v1/listings/:id                                   → detail
 *   PATCH  /v1/listings/:id                      (owner)      → edit
 *   POST   /v1/listings/:id/transition           (owner)      → state change
 *   POST   /v1/listings/:id/photos               (owner)      → attach photo keys
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth, requireRole } from "../lib/auth";
import {
  createListing, getListing, updateListing, transitionListing,
  listMyListings, listPublicListings, attachPhotos,
  ListingInputSchema, ListingPatchSchema,
} from "../services/listings";
import { listingEnrichmentQueue } from "../workers/queues";
import { ValidationError } from "../lib/errors";
import { recordEvent } from "../services/events";

const PublicQuery = z.object({
  neighborhood: z.string().optional(),
  category: z.enum(["BEDSITTER", "STUDIO", "ONE_BR", "TWO_BR", "THREE_BR", "FOUR_PLUS_BR", "MAISONETTE", "TOWNHOUSE"]).optional(),
  bedroomsMin: z.coerce.number().int().min(0).max(10).optional(),
  rentMaxKes: z.coerce.number().int().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

const TransitionBody = z.object({
  to: z.enum(["DRAFT", "PENDING_REVIEW", "ACTIVE", "PAUSED", "RENTED", "REMOVED"]),
});

const AttachPhotosBody = z.object({
  keys: z.array(z.string().min(5).max(300)).min(1).max(20),
  /** If true, kick off AI enrichment (vision → listing draft + embedding). */
  enrich: z.boolean().default(false),
});

export async function listingRoutes(app: FastifyInstance) {
  app.post(
    "/v1/listings",
    { preHandler: requireRole("AGENT", "LANDLORD", "ADMIN") },
    async (req, reply) => {
      const input = ListingInputSchema.parse(req.body);
      const listing = await createListing(req.user!.sub, input);
      return reply.code(201).send(listing);
    },
  );

  app.get(
    "/v1/listings/me",
    { preHandler: requireRole("AGENT", "LANDLORD", "ADMIN") },
    async (req, reply) => {
      const listings = await listMyListings(req.user!.sub);
      return reply.send({ items: listings });
    },
  );

  app.get("/v1/listings", async (req, reply) => {
    const q = PublicQuery.parse(req.query);
    const result = await listPublicListings({
      neighborhood: q.neighborhood,
      category: q.category,
      bedroomsMin: q.bedroomsMin,
      rentMaxKesCents: q.rentMaxKes !== undefined ? q.rentMaxKes * 100 : undefined,
      cursor: q.cursor,
      limit: q.limit,
    });
    return reply.send(result);
  });

  app.get("/v1/listings/:id", async (req, reply) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
    const listing = await getListing(id);
    recordEvent({
      type: "listing_view",
      actorId: req.user?.sub ?? null,
      actorRole: req.user?.role ?? null,
      targetType: "listing",
      targetId: id,
      ip: req.ip,
      userAgent: req.headers["user-agent"] ?? null,
    });
    return reply.send(listing);
  });

  app.patch(
    "/v1/listings/:id",
    { preHandler: requireAuth },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
      const patch = ListingPatchSchema.parse(req.body);
      if (!req.user) throw new ValidationError("No session");
      const listing = await updateListing(id, req.user.sub, req.user.role, patch);
      return reply.send(listing);
    },
  );

  app.post(
    "/v1/listings/:id/transition",
    { preHandler: requireAuth },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
      const { to } = TransitionBody.parse(req.body);
      if (!req.user) throw new ValidationError("No session");
      const listing = await transitionListing(id, req.user.sub, req.user.role, to);
      return reply.send(listing);
    },
  );

  app.post(
    "/v1/listings/:id/photos",
    { preHandler: requireAuth },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
      const { keys, enrich } = AttachPhotosBody.parse(req.body);
      if (!req.user) throw new ValidationError("No session");
      const listing = await attachPhotos(id, req.user.sub, req.user.role, keys);

      if (enrich) {
        await listingEnrichmentQueue.add("enrich", { listingId: id });
      }
      return reply.send(listing);
    },
  );
}
