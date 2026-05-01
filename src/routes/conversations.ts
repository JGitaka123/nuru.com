/**
 * Conversation routes.
 *
 *   POST /v1/conversations                       (tenant) start from a listing
 *   GET  /v1/conversations                       my conversations
 *   GET  /v1/conversations/:id                   detail
 *   GET  /v1/conversations/:id/messages          history (paginated by cursor)
 *   GET  /v1/conversations/:id/stream            SSE — real-time delivery
 *   POST /v1/conversations/:id/messages          send
 *   POST /v1/conversations/:id/read              mark read
 *   POST /v1/conversations/:id/archive           hide from inbox
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth, requireRole } from "../lib/auth";
import {
  getOrCreate, listForUser, loadConversation, listMessages,
  sendMessage, markRead, archive, subscribe, SendMessageSchema,
} from "../services/conversations";
import { ValidationError } from "../lib/errors";

export async function conversationRoutes(app: FastifyInstance) {
  app.post(
    "/v1/conversations",
    { preHandler: requireRole("TENANT", "ADMIN") },
    async (req, reply) => {
      const { listingId } = z.object({ listingId: z.string().min(1) }).parse(req.body);
      const c = await getOrCreate({ listingId, tenantId: req.user!.sub });
      return reply.code(201).send(c);
    },
  );

  app.get(
    "/v1/conversations",
    { preHandler: requireAuth },
    async (req, reply) => {
      if (!req.user) throw new ValidationError("No session");
      const items = await listForUser(req.user.sub, req.user.role);
      return reply.send({ items });
    },
  );

  app.get(
    "/v1/conversations/:id",
    { preHandler: requireAuth },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
      if (!req.user) throw new ValidationError("No session");
      const c = await loadConversation(id, req.user.sub, req.user.role);
      return reply.send(c);
    },
  );

  app.get(
    "/v1/conversations/:id/messages",
    { preHandler: requireAuth },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
      const q = z.object({
        before: z.string().datetime().optional(),
        limit: z.coerce.number().int().min(1).max(200).optional(),
      }).parse(req.query);
      if (!req.user) throw new ValidationError("No session");
      const items = await listMessages(id, req.user.sub, req.user.role, q);
      return reply.send({ items });
    },
  );

  app.post(
    "/v1/conversations/:id/messages",
    { preHandler: requireAuth },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
      const input = SendMessageSchema.parse(req.body);
      if (!req.user) throw new ValidationError("No session");
      const m = await sendMessage(id, req.user.sub, req.user.role, input);
      return reply.code(201).send(m);
    },
  );

  app.post(
    "/v1/conversations/:id/read",
    { preHandler: requireAuth },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
      if (!req.user) throw new ValidationError("No session");
      await markRead(id, req.user.sub);
      return reply.code(204).send();
    },
  );

  app.post(
    "/v1/conversations/:id/archive",
    { preHandler: requireAuth },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
      if (!req.user) throw new ValidationError("No session");
      await archive(id, req.user.sub);
      return reply.code(204).send();
    },
  );

  // Server-Sent Events stream — minimal, no extra deps.
  app.get(
    "/v1/conversations/:id/stream",
    { preHandler: requireAuth },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
      if (!req.user) throw new ValidationError("No session");
      await loadConversation(id, req.user.sub, req.user.role);

      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
      reply.raw.write(`event: open\ndata: ${JSON.stringify({ ok: true })}\n\n`);

      const unsubscribe = subscribe(id, (e) => {
        try {
          reply.raw.write(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`);
        } catch {
          // client gone
        }
      });

      const ping = setInterval(() => {
        try { reply.raw.write(`: ping\n\n`); } catch { /* gone */ }
      }, 25_000);

      req.raw.on("close", () => {
        clearInterval(ping);
        unsubscribe();
      });
    },
  );
}
