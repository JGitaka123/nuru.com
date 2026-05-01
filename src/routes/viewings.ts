/**
 * Viewing routes.
 *   POST  /v1/viewings                          (tenant) book
 *   GET   /v1/viewings/me                       list my viewings
 *   POST  /v1/viewings/:id/confirm              (agent) confirm
 *   POST  /v1/viewings/:id/reschedule           reschedule
 *   POST  /v1/viewings/:id/cancel               cancel
 *   POST  /v1/viewings/:id/complete             (agent) mark completed
 *   POST  /v1/viewings/:id/rate                 (tenant) rate
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth, requireRole } from "../lib/auth";
import {
  bookViewing, confirmViewing, rescheduleViewing,
  setViewingStatus, listMyViewings, BookingInputSchema,
} from "../services/viewings";
import { ValidationError } from "../lib/errors";

const IdParam = z.object({ id: z.string().min(1) });

export async function viewingRoutes(app: FastifyInstance) {
  app.post(
    "/v1/viewings",
    { preHandler: requireRole("TENANT", "ADMIN") },
    async (req, reply) => {
      const input = BookingInputSchema.parse(req.body);
      const v = await bookViewing(req.user!.sub, input);
      return reply.code(201).send(v);
    },
  );

  app.get(
    "/v1/viewings/me",
    { preHandler: requireAuth },
    async (req, reply) => {
      if (!req.user) throw new ValidationError("No session");
      const items = await listMyViewings(req.user.sub, req.user.role);
      return reply.send({ items });
    },
  );

  app.post(
    "/v1/viewings/:id/confirm",
    { preHandler: requireRole("AGENT", "LANDLORD", "ADMIN") },
    async (req, reply) => {
      const { id } = IdParam.parse(req.params);
      const v = await confirmViewing(id, req.user!.sub, req.user!.role);
      return reply.send(v);
    },
  );

  app.post(
    "/v1/viewings/:id/reschedule",
    { preHandler: requireAuth },
    async (req, reply) => {
      const { id } = IdParam.parse(req.params);
      const { scheduledAt } = z.object({ scheduledAt: z.coerce.date() }).parse(req.body);
      if (!req.user) throw new ValidationError("No session");
      const v = await rescheduleViewing(id, req.user.sub, req.user.role, scheduledAt);
      return reply.send(v);
    },
  );

  app.post(
    "/v1/viewings/:id/cancel",
    { preHandler: requireAuth },
    async (req, reply) => {
      const { id } = IdParam.parse(req.params);
      if (!req.user) throw new ValidationError("No session");
      const v = await setViewingStatus(id, req.user.sub, req.user.role, "CANCELLED");
      return reply.send(v);
    },
  );

  app.post(
    "/v1/viewings/:id/complete",
    { preHandler: requireRole("AGENT", "LANDLORD", "ADMIN") },
    async (req, reply) => {
      const { id } = IdParam.parse(req.params);
      const v = await setViewingStatus(id, req.user!.sub, req.user!.role, "COMPLETED");
      return reply.send(v);
    },
  );

  app.post(
    "/v1/viewings/:id/rate",
    { preHandler: requireRole("TENANT", "ADMIN") },
    async (req, reply) => {
      const { id } = IdParam.parse(req.params);
      const { rating } = z.object({ rating: z.number().int().min(1).max(5) }).parse(req.body);
      const v = await setViewingStatus(id, req.user!.sub, req.user!.role, "COMPLETED", rating);
      return reply.send(v);
    },
  );
}
