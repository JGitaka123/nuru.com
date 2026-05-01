/**
 * Admin endpoints for the AI feedback loop.
 *
 *   GET  /v1/admin/ai/queue?task=…&strategy=low_confidence  — review queue
 *   GET  /v1/admin/ai/metrics?sinceDays=7                  — accept/edit rates
 *   POST /v1/admin/ai/:id/feedback                          — grade an output
 *   GET  /v1/admin/ai/eval-candidates                       — promote-to-eval set
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireRole } from "../lib/auth";
import {
  submitFeedback, listUngraded, feedbackMetrics, listEvalCandidates,
  FeedbackSchema,
} from "../services/ai-feedback";

const QueueQuery = z.object({
  task: z.string().optional(),
  strategy: z.enum(["recent", "low_confidence"]).default("recent"),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const MetricsQuery = z.object({
  sinceDays: z.coerce.number().int().min(1).max(90).default(7),
});

export async function aiFeedbackRoutes(app: FastifyInstance) {
  app.get(
    "/v1/admin/ai/queue",
    { preHandler: requireRole("ADMIN") },
    async (req, reply) => {
      const q = QueueQuery.parse(req.query);
      const items = await listUngraded(q);
      return reply.send({ items });
    },
  );

  app.get(
    "/v1/admin/ai/metrics",
    { preHandler: requireRole("ADMIN") },
    async (req, reply) => {
      const q = MetricsQuery.parse(req.query);
      const m = await feedbackMetrics(q);
      return reply.send(m);
    },
  );

  app.post(
    "/v1/admin/ai/:id/feedback",
    { preHandler: requireRole("ADMIN") },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
      const input = FeedbackSchema.parse(req.body);
      const fb = await submitFeedback(id, req.user!.sub, input);
      return reply.code(201).send(fb);
    },
  );

  app.get(
    "/v1/admin/ai/eval-candidates",
    { preHandler: requireRole("ADMIN") },
    async (req, reply) => {
      const q = z.object({
        sinceDays: z.coerce.number().int().min(1).max(90).default(7),
        limit: z.coerce.number().int().min(1).max(200).default(50),
      }).parse(req.query);
      const items = await listEvalCandidates(q);
      return reply.send({ items });
    },
  );
}
