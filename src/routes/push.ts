/**
 * Push subscription routes.
 *
 *   GET  /v1/push/public-key             — returns VAPID public key for the SW
 *   POST /v1/push/subscribe   (auth)     — register a browser subscription
 *   DELETE /v1/push/subscribe (auth)     — unregister by endpoint
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db/client";
import { requireAuth } from "../lib/auth";
import { ValidationError } from "../lib/errors";

const SubscribeBody = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
  userAgent: z.string().max(500).optional(),
});

const UnsubscribeBody = z.object({
  endpoint: z.string().url(),
});

export async function pushRoutes(app: FastifyInstance) {
  app.get("/v1/push/public-key", async (_req, reply) => {
    return reply.send({ key: process.env.VAPID_PUBLIC_KEY ?? null });
  });

  app.post(
    "/v1/push/subscribe",
    { preHandler: requireAuth },
    async (req, reply) => {
      if (!req.user) throw new ValidationError("No session");
      const body = SubscribeBody.parse(req.body);
      const sub = await prisma.pushSubscription.upsert({
        where: { endpoint: body.endpoint },
        create: {
          userId: req.user.sub,
          endpoint: body.endpoint,
          p256dh: body.keys.p256dh,
          auth: body.keys.auth,
          userAgent: body.userAgent,
        },
        update: {
          userId: req.user.sub,
          p256dh: body.keys.p256dh,
          auth: body.keys.auth,
          userAgent: body.userAgent,
          lastUsedAt: new Date(),
        },
      });
      return reply.send({ id: sub.id });
    },
  );

  app.delete(
    "/v1/push/subscribe",
    { preHandler: requireAuth },
    async (req, reply) => {
      if (!req.user) throw new ValidationError("No session");
      const body = UnsubscribeBody.parse(req.body);
      await prisma.pushSubscription.deleteMany({
        where: { endpoint: body.endpoint, userId: req.user.sub },
      });
      return reply.code(204).send();
    },
  );
}
