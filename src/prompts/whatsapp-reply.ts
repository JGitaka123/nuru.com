/**
 * WhatsApp inbound autoreply drafter.
 *
 * Tenants and agents sometimes prefer WhatsApp to the in-app inbox. This
 * prompt drafts a reply on the agent's behalf. The agent reviews + sends
 * (or auto-send if they're a Pro tier with autoreply on).
 *
 * Model: Haiku 4.5 (cheap, multilingual, good at short replies).
 * Cost: ~$0.0006/draft (1K cached system prompt + ~150 tokens out).
 */

import { z } from "zod";
import { run, type RunResult } from "../ai/router";

export const ReplyContextSchema = z.object({
  tenantMessage: z.string(),
  detectedLanguage: z.enum(["en", "sw", "sheng", "mixed"]).optional(),
  listing: z.object({
    title: z.string(),
    neighborhood: z.string(),
    rentKes: z.number(),
    bedrooms: z.number(),
    features: z.array(z.string()),
  }),
  agentName: z.string(),
  /** Last 0-5 message exchange pairs for context. */
  history: z.array(z.object({ from: z.enum(["tenant", "agent"]), text: z.string() })).max(10),
});

export type ReplyContext = z.infer<typeof ReplyContextSchema>;

export const ReplyDraftSchema = z.object({
  reply: z.string().max(500),
  language: z.enum(["en", "sw", "sheng"]),
  /** If the message asks for something we shouldn't auto-decide (price negotiation,
   *  custom viewing time outside business hours), flag for the agent. */
  needsAgentReview: z.boolean(),
  reviewReason: z.string().nullable(),
});

export type ReplyDraft = z.infer<typeof ReplyDraftSchema>;

const SYSTEM_PROMPT = `
You draft WhatsApp replies for Nuru.com agents responding to tenant inquiries
about Nairobi rentals. Match the tenant's language: English, Swahili, or
Sheng. Be polite, concise, factual.

# Rules
1. NEVER share the agent's personal phone number, WhatsApp number, or any
   contact outside Nuru.
2. NEVER negotiate rent. If the tenant asks "is the price negotiable?",
   set needsAgentReview = true and propose a polite holding reply.
3. NEVER promise the listing is available without checking — say "if it's
   still available, the agent will confirm".
4. If asked for a viewing, propose 2-3 time slots in EAT business hours
   (Mon-Sat 9am-5pm), include the link "Book on Nuru: nuru.com/listing/<id>".
5. Keep replies under 500 chars. Prefer 100-200.
6. Never insert agent's real name or phone — refer to them as the listed
   agent name only.
7. Match the tenant's language. If they wrote Swahili, reply in Swahili.
   If Sheng, reply in friendly Sheng. Mixed → mirror the dominant language.
8. End with a soft CTA: "Let me know if you'd like to view it" or similar.

# Output (strict JSON)
{
  "reply": "string ≤500 chars",
  "language": "en|sw|sheng",
  "needsAgentReview": boolean,
  "reviewReason": "string or null — why a human should look before sending"
}
`.trim();

export async function draftWhatsAppReply(ctx: ReplyContext): Promise<RunResult<ReplyDraft>> {
  const safe = ReplyContextSchema.parse(ctx);
  const userText = `
Listing: ${safe.listing.title} (${safe.listing.bedrooms}BR, ${safe.listing.neighborhood}, KES ${safe.listing.rentKes.toLocaleString()}/mo)
Features: ${safe.listing.features.join(", ") || "(none listed)"}
Listed by: ${safe.agentName}

History:
${safe.history.length === 0 ? "(no prior messages)" : safe.history.map((h) => `${h.from}: ${h.text}`).join("\n")}

Tenant just sent:
${safe.tenantMessage}

Draft a reply as JSON.
  `.trim();

  const result = await run<ReplyDraft>({
    task: "auto_reply_draft",
    systemPrompt: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userText }],
    jsonMode: true,
    maxOutputTokens: 400,
  });
  const parsed = ReplyDraftSchema.parse(result.content);
  return { ...result, content: parsed };
}
