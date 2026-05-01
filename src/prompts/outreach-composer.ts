/**
 * Outreach email composer. Generates a personalized cold email body for
 * a given lead, using a template prompt key as the seed personality.
 *
 * Model: Sonnet 4.6 — quality matters; sloppy AI emails get marked as spam.
 * Cost: ~$0.005/email (1.5K cached + ~400 out). At $5/MTok input cached
 * it's ~$0.001/email. ~$50 per 50K leads.
 *
 * Output is text + a subject line. We never auto-send the result; it goes
 * into OutreachEmail (status=QUEUED) and the worker sends after dailyCap
 * checks.
 */

import { z } from "zod";
import { run, type RunResult } from "../ai/router";

export const ComposeInputSchema = z.object({
  templatePromptKey: z.string(),     // selects the system-prompt variant below
  lead: z.object({
    type: z.enum(["AUCTIONEER", "BANK", "AGENT_AGENCY", "LANDLORD", "DEVELOPER", "COURT", "OTHER"]),
    organizationName: z.string(),
    contactName: z.string().nullable(),
    city: z.string().nullable(),
    estimatedListingsCount: z.number().int().nullable(),
    signalNotes: z.string().nullable(),
  }),
});

export const ComposeOutputSchema = z.object({
  subject: z.string().min(5).max(120),
  body: z.string().min(80).max(2400),
  // Self-rated: would a real B2B sender be okay sending this?
  qualityScore: z.number().min(0).max(1),
  // If the model believes this lead shouldn't be contacted (signal looks
  // wrong, organization name suspicious, etc.) — flag for human review.
  skip: z.boolean(),
  skipReason: z.string().nullable(),
});

export type ComposeOutput = z.infer<typeof ComposeOutputSchema>;

const COMMON_RULES = `
You write professional, brief B2B cold emails on behalf of Nuru.com,
an AI-native rental marketplace for Kenya. Recipients are organizations
with property listings to place — auctioneers, banks (foreclosed assets),
real estate agents, developers, landlords.

# Hard rules
1. Subject line 5-90 chars, specific, no clickbait, no all-caps, no emojis.
2. Body 80-220 words. Plain Kenyan English. Natural paragraphs.
3. NEVER fabricate stats. Reference what's TRUE about Nuru:
   - AI-drafts listings from 6 photos in 60 seconds
   - M-Pesa escrow holds tenant deposits until move-in confirmation
   - Verified-listings badge cuts scam reports
   - Conversational search in English/Swahili/Sheng
4. Mention something SPECIFIC about the recipient organization (use the
   signalNotes / type / city). Do NOT generic-spray.
5. End with one clear, low-friction CTA: "Reply to this email" OR
   "Book a 10-minute call here: nuru.com/agent". Never both.
6. Include nothing illegal: no PII about specific people, no scraped phone
   numbers, no unverified claims.
7. If signalNotes is empty/weak OR organizationName looks fake/PII,
   set skip=true and explain in skipReason.
8. NEVER ask for money or credentials in the email.

# Tone by recipient type
- BANK: formal, compliance-aware, mention NDA-friendly process
- AUCTIONEER: practical, fast turnaround, market reach
- AGENT_AGENCY: commission-friendly, AI listing speed
- DEVELOPER: bulk-listing tools, lease management
- LANDLORD: simplicity, escrow safety
- COURT: not direct outreach — skip with reason "court notice; no contact"

# Output: STRICT JSON
{
  "subject": "string",
  "body": "string with \\n\\n paragraph breaks",
  "qualityScore": 0.0-1.0,
  "skip": boolean,
  "skipReason": "string or null"
}
`.trim();

const TEMPLATE_PROMPTS: Record<string, string> = {
  bank_auction_v1: COMMON_RULES + `

# Variant: bank_auction_v1
Audience: bank repossession / foreclosure desks. They have well-defined
KYC processes; respect that. Position Nuru as a way to reach pre-screened
tenants/buyers without a Jiji wall of inquiries.
`,
  auctioneer_v1: COMMON_RULES + `

# Variant: auctioneer_v1
Audience: licensed auctioneers running residential lots. They care about
turnover speed and verified bidders. Lead with: AI-listing in 60s,
verified tenants, no viewing-fee scams.
`,
  agent_warm_v1: COMMON_RULES + `

# Variant: agent_warm_v1
Audience: established Nairobi agents. They likely already use Jiji or
property24. Differentiate by: AI-photo→listing speed, escrow trust badge,
free Pro tier for first 50 listings (no spammy discount language).
`,
  developer_v1: COMMON_RULES + `

# Variant: developer_v1
Audience: residential developers with multiple units. Position bulk
listing tools + lease lifecycle (deposit escrow → move-in confirmation).
`,
  landlord_direct_v1: COMMON_RULES + `

# Variant: landlord_direct_v1
Audience: direct landlords (no agency). Plain language. Lead with
"AI writes the listing for you" + "deposits held safely" — do NOT mention
agent commission.
`,
};

export async function composeOutreach(
  input: z.infer<typeof ComposeInputSchema>,
  meta?: { actorId?: string | null; targetId?: string | null },
): Promise<RunResult<ComposeOutput>> {
  const data = ComposeInputSchema.parse(input);
  const systemPrompt = TEMPLATE_PROMPTS[data.templatePromptKey];
  if (!systemPrompt) {
    throw new Error(`Unknown templatePromptKey: ${data.templatePromptKey}`);
  }

  const userText = `
Lead:
- Type: ${data.lead.type}
- Organization: ${data.lead.organizationName}
- Contact: ${data.lead.contactName ?? "(unknown — use a generic salutation: 'Hello')"}
- City: ${data.lead.city ?? "Nairobi"}
- Listings signal: ${data.lead.estimatedListingsCount !== null ? `~${data.lead.estimatedListingsCount} listings observed` : "unknown count"}
- Notes: ${data.lead.signalNotes ?? "(none)"}

Compose the email as JSON.
  `.trim();

  const result = await run<ComposeOutput>({
    task: "auto_reply_draft",       // Haiku tier — adequate for outreach drafting
    escalate: true,                  // bump to Sonnet because send-once-not-edited
    systemPrompt,
    messages: [{ role: "user", content: userText }],
    jsonMode: true,
    maxOutputTokens: 1000,
    actorId: meta?.actorId ?? null,
    targetType: "lead",
    targetId: meta?.targetId ?? null,
  });

  const parsed = ComposeOutputSchema.parse(result.content);
  return { ...result, content: parsed };
}
