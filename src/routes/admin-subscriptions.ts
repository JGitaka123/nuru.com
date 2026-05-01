/**
 * Admin subscription + agent-task management.
 *
 *   GET  /v1/admin/subscriptions                 paginated, filterable
 *   POST /v1/admin/subscriptions/:userId/pause   admin pause/unpause
 *   GET  /v1/admin/agent-tasks                   queue
 *   POST /v1/admin/agent-tasks/:id/approve       approve REVIEW_NEEDED
 *   POST /v1/admin/agent-tasks/:id/cancel
 *   POST /v1/admin/promo-codes                   create
 *   GET  /v1/admin/promo-codes                   list
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db/client";
import { requireRole } from "../lib/auth";
import { approveTask } from "../services/agent-tasks";

export async function adminSubscriptionRoutes(app: FastifyInstance) {
  app.get(
    "/v1/admin/subscriptions",
    { preHandler: requireRole("ADMIN") },
    async (req, reply) => {
      const q = z.object({
        status: z.enum(["TRIALING", "ACTIVE", "PAST_DUE", "CANCELED", "EXPIRED", "PAUSED"]).optional(),
        tier: z.enum(["TRIAL", "BRONZE", "SILVER", "GOLD", "PLATINUM"]).optional(),
        cursor: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(200).default(50),
      }).parse(req.query);
      const items = await prisma.subscription.findMany({
        where: {
          ...(q.status ? { status: q.status } : {}),
          ...(q.tier ? { planTier: q.tier } : {}),
        },
        orderBy: { updatedAt: "desc" },
        take: q.limit + 1,
        ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
        include: { plan: true, invoices: { orderBy: { createdAt: "desc" }, take: 3 } },
      });
      const hasMore = items.length > q.limit;
      return reply.send({
        items: hasMore ? items.slice(0, q.limit) : items,
        nextCursor: hasMore ? items[q.limit - 1].id : null,
      });
    },
  );

  app.post(
    "/v1/admin/subscriptions/:userId/pause",
    { preHandler: requireRole("ADMIN") },
    async (req, reply) => {
      const { userId } = z.object({ userId: z.string().min(1) }).parse(req.params);
      const { paused } = z.object({ paused: z.boolean() }).parse(req.body);
      const sub = await prisma.subscription.update({
        where: { userId },
        data: { status: paused ? "PAUSED" : "ACTIVE" },
      });
      return reply.send(sub);
    },
  );

  app.get(
    "/v1/admin/agent-tasks",
    { preHandler: requireRole("ADMIN") },
    async (req, reply) => {
      const q = z.object({
        status: z.enum(["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELED", "REVIEW_NEEDED"]).optional(),
        kind: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(200).default(50),
      }).parse(req.query);
      const items = await prisma.agentTask.findMany({
        where: {
          ...(q.status ? { status: q.status } : { status: { in: ["PENDING", "REVIEW_NEEDED", "IN_PROGRESS"] } }),
          ...(q.kind ? { kind: q.kind as never } : {}),
        },
        orderBy: [{ priority: "desc" }, { dueAt: "asc" }],
        take: q.limit,
      });
      return reply.send({ items });
    },
  );

  app.post(
    "/v1/admin/agent-tasks/:id/approve",
    { preHandler: requireRole("ADMIN") },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
      const edits = z.object({
        smsBody: z.string().max(320).optional(),
        emailSubject: z.string().max(120).optional(),
        emailBody: z.string().max(2000).optional(),
      }).parse(req.body ?? {});
      const draft = await approveTask(id, req.user!.sub, edits);
      return reply.send({ approved: true, draft });
    },
  );

  app.post(
    "/v1/admin/agent-tasks/:id/cancel",
    { preHandler: requireRole("ADMIN") },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
      const t = await prisma.agentTask.update({
        where: { id },
        data: { status: "CANCELED", canceledAt: new Date() },
      });
      return reply.send(t);
    },
  );

  app.post(
    "/v1/admin/promo-codes",
    { preHandler: requireRole("ADMIN") },
    async (req, reply) => {
      const body = z.object({
        code: z.string().min(3).max(40).regex(/^[A-Z0-9_-]+$/),
        description: z.string().max(200).optional(),
        discountPct: z.number().int().min(0).max(100).default(0),
        freeMonths: z.number().int().min(0).max(12).default(0),
        expiresAt: z.string().datetime().optional(),
        maxRedemptions: z.number().int().min(1).optional(),
        appliesToTiers: z.array(z.enum(["TRIAL", "BRONZE", "SILVER", "GOLD", "PLATINUM"])).default([]),
      }).parse(req.body);
      const created = await prisma.promoCode.create({
        data: {
          code: body.code.toUpperCase(),
          description: body.description,
          discountPct: body.discountPct,
          freeMonths: body.freeMonths,
          expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
          maxRedemptions: body.maxRedemptions,
          appliesToTiers: body.appliesToTiers,
        },
      });
      return reply.code(201).send(created);
    },
  );

  app.get(
    "/v1/admin/promo-codes",
    { preHandler: requireRole("ADMIN") },
    async (_req, reply) => {
      const items = await prisma.promoCode.findMany({ orderBy: { createdAt: "desc" }, take: 200 });
      return reply.send({ items });
    },
  );
}
