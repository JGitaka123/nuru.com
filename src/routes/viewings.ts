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
import { prisma } from "../db/client";
import { ValidationError, NotFoundError, ForbiddenError } from "../lib/errors";

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

  // Calendar (.ics) for confirmed viewings — adds to Apple/Google/Outlook.
  app.get(
    "/v1/viewings/:id/calendar.ics",
    { preHandler: requireAuth },
    async (req, reply) => {
      const { id } = IdParam.parse(req.params);
      if (!req.user) throw new ValidationError("No session");
      const v = await prisma.viewing.findUnique({
        where: { id },
        include: { listing: { select: { title: true, neighborhood: true, addressLine: true, agent: { select: { phoneE164: true, name: true } } } } },
      });
      if (!v) throw new NotFoundError("Viewing");
      if (req.user.role !== "ADMIN" && v.tenantId !== req.user.sub && v.listing && (v.listing as any).agent === null) {
        throw new ForbiddenError("Not your viewing");
      }
      const dt = (d: Date) => d.toISOString().replace(/[-:]|\.\d{3}/g, "");
      const start = v.scheduledAt;
      const end = new Date(start.getTime() + 30 * 60 * 1000);
      const ics = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Nuru//Viewings//EN",
        "BEGIN:VEVENT",
        `UID:viewing-${v.id}@nuru.com`,
        `DTSTAMP:${dt(new Date())}`,
        `DTSTART:${dt(start)}`,
        `DTEND:${dt(end)}`,
        `SUMMARY:Nuru — viewing: ${escapeIcs(v.listing.title)}`,
        `LOCATION:${escapeIcs(v.listing.addressLine ?? v.listing.neighborhood)}`,
        `DESCRIPTION:${escapeIcs(`Agent: ${v.listing.agent.name ?? ""} ${v.listing.agent.phoneE164}`)}`,
        "END:VEVENT",
        "END:VCALENDAR",
      ].join("\r\n");
      reply
        .header("Content-Type", "text/calendar; charset=utf-8")
        .header("Content-Disposition", `attachment; filename="viewing-${v.id}.ics"`)
        .send(ics);
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

function escapeIcs(s: string): string {
  return s.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\r?\n/g, "\\n");
}
