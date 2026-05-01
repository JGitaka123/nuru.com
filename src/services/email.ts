/**
 * Email service — wraps Resend.
 *
 * Required vendor setup: see docs/runbooks/vendor-setup.md §6.
 * Without RESEND_API_KEY set, send() no-ops with a warning so dev/test
 * environments keep working.
 *
 * All transactional + marketing emails route through here so we have a
 * single place to enforce: from-address, footer, suppression, tracking.
 */

import axios from "axios";
import { logger } from "../lib/logger";
import { prisma } from "../db/client";
import { ExternalServiceError } from "../lib/errors";

interface SendOpts {
  to: string;
  subject: string;
  text: string;
  html?: string;
  /** Reply-To header. Defaults to FROM. */
  replyTo?: string;
  /** Resend tag(s) for grouping in dashboards. */
  tags?: Array<{ name: string; value: string }>;
  /** When true, treat as marketing (check suppression first). Default false (transactional). */
  marketing?: boolean;
}

interface SendResult {
  id: string;
  /** True only if Resend accepted the send. */
  sent: boolean;
  suppressed?: boolean;
  reason?: string;
}

const FROM = process.env.EMAIL_FROM ?? "Nuru <noreply@nuru.com>";
const REPLY_TO = process.env.EMAIL_REPLY_TO ?? "hello@nuru.com";
const UNSUBSCRIBE_BASE = process.env.WEB_URL ?? "https://nuru.com";

function isConfigured(): boolean {
  return !!process.env.RESEND_API_KEY;
}

/** Public unsubscribe URL — token is the email's url-safe base64 hash. */
export function unsubscribeUrl(email: string): string {
  return `${UNSUBSCRIBE_BASE}/unsubscribe?e=${encodeURIComponent(Buffer.from(email).toString("base64url"))}`;
}

/** Append the legal footer required by Kenya DPA + CAN-SPAM. */
export function withFooter(body: string, email: string, marketing: boolean): { text: string; html: string } {
  const unsubscribe = unsubscribeUrl(email);
  const footerText = marketing
    ? `\n\n--\nNuru.com · Long-term rentals in Nairobi · Westlands, Nairobi, Kenya\nUnsubscribe: ${unsubscribe}\nWe never share your email. ODPC reg: <pending>.`
    : `\n\n--\nNuru.com · Westlands, Nairobi, Kenya\nNeed help? hello@nuru.com`;
  const text = body + footerText;
  const html = `<div style="font-family:system-ui,sans-serif;line-height:1.5;color:#1f232c">
  ${body.split("\n").map((l) => `<p style="margin:0 0 12px">${escapeHtml(l)}</p>`).join("")}
  <hr style="border:0;border-top:1px solid #ecedf2;margin:24px 0"/>
  <p style="font-size:12px;color:#878fa5">
    Nuru.com · Long-term rentals in Nairobi · Westlands, Nairobi, Kenya<br/>
    ${marketing ? `<a href="${unsubscribe}" style="color:#878fa5">Unsubscribe</a> · ` : ""}
    ODPC reg: pending
  </p>
</div>`;
  return { text, html };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function isSuppressed(email: string): Promise<boolean> {
  const row = await prisma.suppressionList.findUnique({ where: { email: email.toLowerCase() } });
  return row !== null;
}

export async function send(opts: SendOpts): Promise<SendResult> {
  const to = opts.to.toLowerCase();

  if (opts.marketing && (await isSuppressed(to))) {
    logger.info({ to: "[redacted]" }, "send suppressed");
    return { id: "", sent: false, suppressed: true, reason: "suppression_list" };
  }

  if (!isConfigured()) {
    logger.warn({ to: "[redacted]", subject: opts.subject }, "resend not configured — skipping send");
    return { id: "", sent: false, reason: "not_configured" };
  }

  const { text, html } = withFooter(opts.text, opts.to, opts.marketing ?? false);
  const finalHtml = opts.html ? withFooter(opts.html, opts.to, opts.marketing ?? false).html : html;

  try {
    const { data } = await axios.post<{ id: string }>(
      "https://api.resend.com/emails",
      {
        from: FROM,
        to: [opts.to],
        reply_to: opts.replyTo ?? REPLY_TO,
        subject: opts.subject,
        text,
        html: finalHtml,
        tags: opts.tags ?? [],
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        timeout: 15_000,
      },
    );
    return { id: data.id, sent: true };
  } catch (err) {
    logger.error({ err, subject: opts.subject }, "resend send failed");
    throw new ExternalServiceError("Resend", err);
  }
}

export async function suppress(email: string, reason: string, notes?: string): Promise<void> {
  await prisma.suppressionList.upsert({
    where: { email: email.toLowerCase() },
    create: { email: email.toLowerCase(), reason, notes },
    update: { reason, notes },
  });
}
