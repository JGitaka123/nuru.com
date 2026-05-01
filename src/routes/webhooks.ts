/**
 * Daraja webhooks. Daraja calls these from Safaricom's network.
 *
 * Critical:
 *  - Must respond 200 quickly (Daraja times out fast).
 *  - Must be idempotent — Daraja retries on any non-200.
 *  - Must persist the raw payload BEFORE acting on it (audit trail).
 *  - Must not leak whether we recognized the request (bots probe these).
 */

import type { FastifyInstance } from "fastify";
import { DarajaClient } from "../services/mpesa";
import { handleStkCallback } from "../services/escrow";
import { handleB2CResult, handleB2CTimeout } from "../services/escrow-result";
import { logger } from "../lib/logger";

export async function webhookRoutes(app: FastifyInstance) {
  // STK push result
  app.post("/v1/webhooks/mpesa", async (req, reply) => {
    // Always ack first — process async.
    reply.send({ ResultCode: 0, ResultDesc: "Accepted" });

    try {
      const cb = DarajaClient.parseStkCallback(req.body);
      await handleStkCallback(cb);
    } catch (e) {
      logger.error({ err: e, body: req.body }, "stk callback handling failed");
      // Do not throw — we already replied 200.
    }
  });

  // B2C result — Daraja's async confirmation that the landlord payout landed.
  app.post("/v1/webhooks/mpesa/b2c-result", async (req, reply) => {
    reply.send({ ResultCode: 0, ResultDesc: "Accepted" });
    try {
      await handleB2CResult(req.body);
    } catch (e) {
      logger.error({ err: e, body: req.body }, "b2c result handling failed");
    }
  });

  app.post("/v1/webhooks/mpesa/b2c-timeout", async (req, reply) => {
    reply.send({ ResultCode: 0, ResultDesc: "Accepted" });
    try {
      await handleB2CTimeout(req.body);
    } catch (e) {
      logger.error({ err: e, body: req.body }, "b2c timeout handling failed");
    }
  });
}
