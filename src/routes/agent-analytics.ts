/**
 * Agent analytics — per-listing performance.
 *
 *   GET /v1/agent/analytics                    summary across my listings
 *   GET /v1/agent/listings/:id/analytics       deep-dive on one listing
 *
 * Pulls from the Event table (already populated by services). All
 * authorization at the route level: agent only sees their own listings.
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db/client";
import { requireRole } from "../lib/auth";
import { ForbiddenError, NotFoundError } from "../lib/errors";

const SinceQuery = z.object({
  days: z.coerce.number().int().min(1).max(90).default(30),
});

export async function agentAnalyticsRoutes(app: FastifyInstance) {
  app.get(
    "/v1/agent/analytics",
    { preHandler: requireRole("AGENT", "LANDLORD", "ADMIN") },
    async (req, reply) => {
      const { days } = SinceQuery.parse(req.query);
      const since = new Date(Date.now() - days * 86_400_000);
      const agentId = req.user!.sub;

      const listings = await prisma.listing.findMany({
        where: { agentId },
        select: {
          id: true, title: true, status: true, primaryPhotoKey: true,
          neighborhood: true, rentKesCents: true, publishedAt: true, rentedAt: true,
        },
        orderBy: { updatedAt: "desc" },
      });
      const ids = listings.map((l) => l.id);
      if (ids.length === 0) return reply.send({ days, summary: emptySummary(), perListing: [] });

      const [views, inquiries, applications, viewings, saves] = await Promise.all([
        prisma.event.groupBy({
          by: ["targetId"], where: { type: "listing_view", targetId: { in: ids }, createdAt: { gte: since } },
          _count: { _all: true },
        }),
        prisma.inquiry.groupBy({
          by: ["listingId"], where: { listingId: { in: ids }, createdAt: { gte: since } },
          _count: { _all: true },
        }),
        prisma.application.groupBy({
          by: ["listingId"], where: { listingId: { in: ids }, createdAt: { gte: since } },
          _count: { _all: true },
        }),
        prisma.viewing.groupBy({
          by: ["listingId"], where: { listingId: { in: ids }, createdAt: { gte: since } },
          _count: { _all: true },
        }),
        prisma.savedListing.groupBy({
          by: ["listingId"], where: { listingId: { in: ids }, createdAt: { gte: since } },
          _count: { _all: true },
        }),
      ]);

      const idx = <T extends { _count: { _all: number } }>(rows: T[], key: keyof T): Map<string, number> => {
        const m = new Map<string, number>();
        for (const r of rows) {
          const k = r[key] as unknown as string | null;
          if (k) m.set(k, r._count._all);
        }
        return m;
      };
      const viewIdx = idx(views, "targetId");
      const inqIdx = idx(inquiries, "listingId");
      const appIdx = idx(applications, "listingId");
      const vwIdx = idx(viewings, "listingId");
      const savIdx = idx(saves, "listingId");

      const perListing = listings.map((l) => {
        const v = viewIdx.get(l.id) ?? 0;
        const i = inqIdx.get(l.id) ?? 0;
        const a = appIdx.get(l.id) ?? 0;
        const w = vwIdx.get(l.id) ?? 0;
        const s = savIdx.get(l.id) ?? 0;
        const daysListed = l.publishedAt
          ? Math.max(1, Math.floor(((l.rentedAt?.getTime() ?? Date.now()) - l.publishedAt.getTime()) / 86_400_000))
          : null;
        return {
          id: l.id, title: l.title, status: l.status, neighborhood: l.neighborhood,
          rentKesCents: l.rentKesCents, primaryPhotoKey: l.primaryPhotoKey,
          views: v, inquiries: i, applications: a, viewings: w, saves: s,
          inquiryRate: v > 0 ? i / v : null,
          applicationRate: v > 0 ? a / v : null,
          daysListed,
        };
      });

      const summary = perListing.reduce((acc, l) => ({
        listings: acc.listings + 1,
        active: acc.active + (l.status === "ACTIVE" ? 1 : 0),
        rented: acc.rented + (l.status === "RENTED" ? 1 : 0),
        views: acc.views + l.views,
        inquiries: acc.inquiries + l.inquiries,
        applications: acc.applications + l.applications,
        viewings: acc.viewings + l.viewings,
        saves: acc.saves + l.saves,
      }), emptySummary());

      return reply.send({ days, summary, perListing });
    },
  );

  app.get(
    "/v1/agent/listings/:id/analytics",
    { preHandler: requireRole("AGENT", "LANDLORD", "ADMIN") },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
      const { days } = SinceQuery.parse(req.query);
      const since = new Date(Date.now() - days * 86_400_000);

      const listing = await prisma.listing.findUnique({ where: { id } });
      if (!listing) throw new NotFoundError("Listing");
      if (listing.agentId !== req.user!.sub && req.user!.role !== "ADMIN") {
        throw new ForbiddenError("Not your listing");
      }

      // Daily breakdown of views.
      const rawDaily: Array<{ d: Date; n: number }> = await prisma.$queryRawUnsafe(`
        SELECT date_trunc('day', created_at) AS d, COUNT(*)::int AS n
        FROM "Event"
        WHERE type = 'listing_view' AND target_id = $1 AND created_at >= $2
        GROUP BY 1 ORDER BY 1
      `, id, since);

      const [views, inquiries, applications, viewings, saves] = await Promise.all([
        prisma.event.count({ where: { type: "listing_view", targetId: id, createdAt: { gte: since } } }),
        prisma.inquiry.count({ where: { listingId: id, createdAt: { gte: since } } }),
        prisma.application.count({ where: { listingId: id, createdAt: { gte: since } } }),
        prisma.viewing.count({ where: { listingId: id, createdAt: { gte: since } } }),
        prisma.savedListing.count({ where: { listingId: id, createdAt: { gte: since } } }),
      ]);

      return reply.send({
        listing: {
          id: listing.id, title: listing.title, status: listing.status,
          neighborhood: listing.neighborhood, rentKesCents: listing.rentKesCents,
          publishedAt: listing.publishedAt, rentedAt: listing.rentedAt,
          fraudScore: listing.fraudScore,
        },
        days,
        totals: { views, inquiries, applications, viewings, saves },
        rates: {
          inquiryRate: views > 0 ? inquiries / views : null,
          applicationRate: views > 0 ? applications / views : null,
          viewingRate: views > 0 ? viewings / views : null,
        },
        daily: rawDaily.map((r) => ({ date: r.d.toISOString().slice(0, 10), views: r.n })),
      });
    },
  );
}

function emptySummary() {
  return { listings: 0, active: 0, rented: 0, views: 0, inquiries: 0, applications: 0, viewings: 0, saves: 0 };
}
