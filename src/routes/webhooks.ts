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
import { parseInboundMessages, verifyWebhookSignature } from "../services/whatsapp";
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

  // WhatsApp Business webhook verification (GET) — Meta calls this once at
  // setup with a verify token we registered. Echo the challenge back.
  app.get("/v1/webhooks/whatsapp", async (req, reply) => {
    const q = req.query as { "hub.mode"?: string; "hub.verify_token"?: string; "hub.challenge"?: string };
    if (q["hub.mode"] === "subscribe" && q["hub.verify_token"] === process.env.WHATSAPP_VERIFY_TOKEN) {
      return reply.code(200).send(q["hub.challenge"] ?? "");
    }
    return reply.code(403).send();
  });

  // WhatsApp inbound messages.
  app.post("/v1/webhooks/whatsapp", async (req, reply) => {
    reply.code(200).send();   // ack first
    const raw = JSON.stringify(req.body);
    const sig = req.headers["x-hub-signature-256"];
    if (!verifyWebhookSignature(raw, typeof sig === "string" ? sig : undefined)) {
      logger.warn("whatsapp webhook signature mismatch");
      return;
    }
    try {
      const messages = parseInboundMessages(req.body);
      for (const m of messages) {
        // TODO: enqueue draftWhatsAppReply via a new BullMQ queue once the
        // Meta account is approved. For now we just log.
        logger.info({ from: "[redacted]", textLen: m.text.length }, "whatsapp inbound");
      }
    } catch (e) {
      logger.error({ err: e }, "whatsapp inbound failed");
    }
  });
}
