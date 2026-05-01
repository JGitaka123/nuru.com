/**
 * WhatsApp Business client.
 *
 * Required vendor setup before this becomes live: see
 * docs/runbooks/vendor-setup.md §5. Until WHATSAPP_ACCESS_TOKEN is set,
 * every send call no-ops with a warning — the rest of the app continues.
 *
 * We use template messages for proactive notifications (viewing reminders,
 * escrow events). Pre-approval of templates is a Meta requirement:
 * see the same runbook for the templates we register.
 *
 * Inbound: see src/routes/webhooks.ts (whatsapp endpoints).
 */

import axios from "axios";
import { logger } from "../lib/logger";
import { toDarajaFormat } from "../lib/phone";

const GRAPH_VERSION = "v20.0";

interface SendTemplateParams {
  toE164: string;
  templateName: string;
  /** Body parameter values, in order, matching the registered template. */
  params: string[];
  languageCode?: string;
}

function isConfigured(): boolean {
  return !!(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
}

export async function sendTemplate(p: SendTemplateParams): Promise<{ messageId: string } | null> {
  if (!isConfigured()) {
    logger.warn({ template: p.templateName }, "whatsapp not configured — skipping");
    return null;
  }

  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID!;
  const token = process.env.WHATSAPP_ACCESS_TOKEN!;

  const body = {
    messaging_product: "whatsapp",
    to: toDarajaFormat(p.toE164),
    type: "template",
    template: {
      name: p.templateName,
      language: { code: p.languageCode ?? "en" },
      components: [
        {
          type: "body",
          parameters: p.params.map((text) => ({ type: "text", text })),
        },
      ],
    },
  };

  try {
    const { data } = await axios.post(
      `https://graph.facebook.com/${GRAPH_VERSION}/${phoneId}/messages`,
      body,
      { headers: { Authorization: `Bearer ${token}` }, timeout: 10_000 },
    );
    return { messageId: data.messages?.[0]?.id ?? "" };
  } catch (err) {
    logger.error({ err, template: p.templateName }, "whatsapp send failed");
    return null;
  }
}

/** Send a freeform text reply, only valid inside a 24h customer service window. */
export async function sendText(toE164: string, text: string): Promise<void> {
  if (!isConfigured()) {
    logger.warn({ to: "[redacted]" }, "whatsapp not configured — skipping text");
    return;
  }
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID!;
  const token = process.env.WHATSAPP_ACCESS_TOKEN!;
  await axios.post(
    `https://graph.facebook.com/${GRAPH_VERSION}/${phoneId}/messages`,
    {
      messaging_product: "whatsapp",
      to: toDarajaFormat(toE164),
      type: "text",
      text: { body: text },
    },
    { headers: { Authorization: `Bearer ${token}` }, timeout: 10_000 },
  );
}

/**
 * Verify Meta's webhook signature header (X-Hub-Signature-256). Required for
 * inbound message security per
 * https://developers.facebook.com/docs/graph-api/webhooks/getting-started.
 */
export function verifyWebhookSignature(rawBody: string, signatureHeader: string | undefined): boolean {
  if (!signatureHeader) return false;
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) {
    logger.warn("WHATSAPP_APP_SECRET not set — accepting webhook unsigned (dev only)");
    return process.env.NODE_ENV !== "production";
  }
  const { createHmac, timingSafeEqual } = require("node:crypto") as typeof import("node:crypto");
  const expected = "sha256=" + createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  return a.length === b.length && timingSafeEqual(a, b);
}

export interface InboundWhatsAppMessage {
  fromE164: string;          // +254... — we normalize from "254..."
  text: string;
  messageId: string;
  timestamp: Date;
}

/** Parse a WhatsApp webhook payload into the messages it contains. */
export function parseInboundMessages(payload: unknown): InboundWhatsAppMessage[] {
  const out: InboundWhatsAppMessage[] = [];
  const entries = (payload as { entry?: Array<{ changes?: Array<{ value?: unknown }> }> })?.entry ?? [];
  for (const entry of entries) {
    for (const change of entry.changes ?? []) {
      const value = change.value as {
        messages?: Array<{
          from: string;
          id: string;
          timestamp: string;
          type: string;
          text?: { body: string };
        }>;
      } | undefined;
      for (const msg of value?.messages ?? []) {
        if (msg.type !== "text" || !msg.text?.body) continue;
        const fromE164 = msg.from.startsWith("+") ? msg.from : `+${msg.from}`;
        out.push({
          fromE164,
          text: msg.text.body,
          messageId: msg.id,
          timestamp: new Date(parseInt(msg.timestamp, 10) * 1000),
        });
      }
    }
  }
  return out;
}
