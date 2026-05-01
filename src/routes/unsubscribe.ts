/**
 * Public unsubscribe endpoint.
 *
 *   GET  /unsubscribe?e=<base64url-email>     human-friendly page
 *   POST /v1/unsubscribe                      { email } — programmatic
 *
 * One-click compliant: GET adds the email to SuppressionList immediately
 * (no second confirmation), per RFC 8058 / Gmail one-click unsubscribe.
 * The page UI lets users opt back in or report a mistake.
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { suppress } from "../services/email";
import { ValidationError } from "../lib/errors";

const QuerySchema = z.object({
  e: z.string().min(4).max(500),
});

function decodeEmail(e: string): string {
  try {
    return Buffer.from(e, "base64url").toString("utf8");
  } catch {
    throw new ValidationError("Invalid token");
  }
}

export async function unsubscribeRoutes(app: FastifyInstance) {
  app.get("/unsubscribe", async (req, reply) => {
    const { e } = QuerySchema.parse(req.query);
    const email = decodeEmail(e);
    if (!/.+@.+\..+/.test(email)) throw new ValidationError("Invalid email");
    await suppress(email, "unsubscribe", "via /unsubscribe link");
    return reply.type("text/html").send(`<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"/><title>Unsubscribed — Nuru.com</title>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>body{font-family:system-ui,sans-serif;max-width:540px;margin:48px auto;padding:0 16px;color:#1f232c}.box{background:#fff;border:1px solid #ecedf2;border-radius:12px;padding:24px}.brand{color:#f5840b;font-weight:700}</style>
</head><body>
<p class="brand">Nuru.com</p>
<div class="box">
<h1 style="margin-top:0">You're unsubscribed</h1>
<p>We won't send any more marketing emails to <strong>${escapeHtml(email)}</strong>.</p>
<p>If this was a mistake, just reply to any of our previous emails and we'll add you back. Transactional emails (about your bookings, deposits, etc.) are not affected.</p>
<p style="color:#878fa5;font-size:13px;margin-top:24px">Nuru.com · Westlands, Nairobi · ODPC reg: pending</p>
</div></body></html>`);
  });

  app.post("/v1/unsubscribe", async (req, reply) => {
    const { email } = z.object({ email: z.string().email() }).parse(req.body);
    await suppress(email, "unsubscribe", "via API");
    return reply.code(204).send();
  });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
