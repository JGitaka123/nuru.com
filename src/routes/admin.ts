/**
 * Admin endpoints — review queues and platform metrics.
 *
 *   GET  /v1/admin/users/pending-verification
 *   GET  /v1/admin/listings/risky                   (fraudScore >= 60)
 *   GET  /v1/admin/metrics                          counts + last-24h activity
 *   POST /v1/admin/listings/:id/force-status        override the state machine
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db/client";
import { requireRole } from "../lib/auth";
import { ValidationError } from "../lib/errors";
import { marketSnapshot } from "../services/market-intel";

const ListingStatusEnum = z.enum([
  "DRAFT", "PENDING_REVIEW", "ACTIVE", "PAUSED", "RENTED", "REMOVED",
]);

export async function adminRoutes(app: FastifyInstance) {
  app.get(
    "/v1/admin/users/pending-verification",
    { preHandler: requireRole("ADMIN") },
    async (_req, reply) => {
      const items = await prisma.user.findMany({
        where: { verificationStatus: "PENDING" },
        orderBy: { updatedAt: "desc" },
        take: 100,
        select: {
          id: true, name: true, phoneE164: true, role: true,
          kraPin: true, createdAt: true, updatedAt: true,
        },
      });
      return reply.send({ items });
    },
  );

  app.get(
    "/v1/admin/listings/risky",
    { preHandler: requireRole("ADMIN") },
    async (_req, reply) => {
      const items = await prisma.listing.findMany({
        where: { fraudScore: { gte: 60 } },
        orderBy: { fraudScore: "desc" },
        take: 100,
        include: {
          agent: { select: { id: true, name: true, phoneE164: true, verificationStatus: true } },
        },
      });
      return reply.send({ items });
    },
  );

  app.get(
    "/v1/admin/metrics",
    { preHandler: requireRole("ADMIN") },
    async (_req, reply) => {
      const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const [
        totalUsers, totalListings, activeListings,
        usersDay, listingsDay, viewingsDay, applicationsDay,
        escrowsHeld, leasesActive, openReports,
      ] = await Promise.all([
        prisma.user.count(),
        prisma.listing.count(),
        prisma.listing.count({ where: { status: "ACTIVE" } }),
        prisma.user.count({ where: { createdAt: { gte: dayAgo } } }),
        prisma.listing.count({ where: { createdAt: { gte: dayAgo } } }),
        prisma.viewing.count({ where: { createdAt: { gte: dayAgo } } }),
        prisma.application.count({ where: { createdAt: { gte: dayAgo } } }),
        prisma.escrow.count({ where: { status: "HELD" } }),
        prisma.lease.count({ where: { status: "ACTIVE" } }),
        prisma.fraudReport.count({ where: { resolvedAt: null } }),
      ]);
      return reply.send({
        totals: { totalUsers, totalListings, activeListings },
        last24h: { usersDay, listingsDay, viewingsDay, applicationsDay },
        operational: { escrowsHeld, leasesActive, openReports },
      });
    },
  );

  /**
   * Conversion funnel for the admin dashboard. Counts events of each
   * funnel-defining type within the lookback window.
   */
  app.get(
    "/v1/admin/funnel",
    { preHandler: requireRole("ADMIN") },
    async (req, reply) => {
      const { days } = z.object({
        days: z.coerce.number().int().min(1).max(90).default(7),
      }).parse(req.query);
      const since = new Date(Date.now() - days * 86_400_000);

      const stages: Array<{ stage: string; types: string[] }> = [
        { stage: "search",            types: ["search"] },
        { stage: "listing_view",      types: ["listing_view"] },
        { stage: "save",              types: ["saved_listing"] },
        { stage: "inquiry",           types: ["inquiry_submit"] },
        { stage: "viewing_book",      types: ["viewing_book"] },
        { stage: "application_submit", types: ["application_submit"] },
        { stage: "approved",          types: ["application_decided"] }, // filter below
        { stage: "escrow_held",       types: ["escrow_held"] },
        { stage: "escrow_released",   types: ["escrow_released"] },
      ];

      const counts: Array<{ stage: string; count: number }> = [];
      for (const s of stages) {
        if (s.stage === "approved") {
          const c = await prisma.event.count({
            where: {
              type: "application_decided",
              createdAt: { gte: since },
              properties: { path: ["decision"], equals: "APPROVED" } as never,
            },
          });
          counts.push({ stage: s.stage, count: c });
        } else {
          const c = await prisma.event.count({
            where: { type: { in: s.types }, createdAt: { gte: since } },
          });
          counts.push({ stage: s.stage, count: c });
        }
      }
      return reply.send({ days, since: since.toISOString(), funnel: counts });
    },
  );

  app.get(
    "/v1/admin/market",
    { preHandler: requireRole("ADMIN") },
    async (_req, reply) => {
      const items = await marketSnapshot();
      return reply.send({ items });
    },
  );

  app.post(
    "/v1/admin/listings/:id/force-status",
    { preHandler: requireRole("ADMIN") },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
      const { to, reason } = z.object({
        to: ListingStatusEnum,
        reason: z.string().min(5).max(500),
      }).parse(req.body);
      if (!req.user) throw new ValidationError("No session");

      const updated = await prisma.listing.update({
        where: { id },
        data: {
          status: to,
          ...(to === "ACTIVE" ? { publishedAt: new Date() } : {}),
        },
      });
      // Audit trail. Use FraudReport with reason "admin_override" for now —
      // replace with a dedicated AdminAction model when it earns its keep.
      // For MVP, just log it.
      req.log.info({ listingId: id, to, reason, byAdminId: req.user.sub }, "admin force-status");
      return reply.send(updated);
    },
  );
}
