/**
 * Client-success message drafter — the autonomous CRM brain.
 *
 * Given a user's profile + usage stats + the trigger kind (trial ending,
 * payment failed, churn risk, etc.), draft a personalized SMS + email
 * that nudges the right action.
 *
 * Model: Sonnet 4.6. Quality matters; bad CRM messages annoy users.
 * Self-rated confidence; auto-execute only when ≥0.7.
 */

import { z } from "zod";
import { run, type RunResult } from "../ai/router";

export const ClientContextSchema = z.object({
  user: z.object({
    name: z.string().nullable(),
    role: z.enum(["TENANT", "AGENT", "LANDLORD", "ADMIN"]),
    preferredLang: z.string().default("en"),
    daysSinceSignup: z.number().int(),
  }),
  subscription: z.object({
    planTier: z.enum(["TRIAL", "BRONZE", "SILVER", "GOLD", "PLATINUM"]),
    status: z.string(),
    trialEndsAt: z.string().nullable(),
    daysUntilTrialEnd: z.number().int().nullable(),
    failedAttempts: z.number().int(),
  }),
  usage: z.object({
    activeListings: z.number().int(),
    totalInquiriesLast30d: z.number().int(),
    totalApplicationsLast30d: z.number().int(),
    totalRented: z.number().int(),
    daysSinceLastLogin: z.number().int().nullable(),
  }),
  taskKind: z.enum([
    "ONBOARDING_NUDGE",
    "TRIAL_ENDING_3_DAYS",
    "TRIAL_ENDING_TODAY",
    "TRIAL_ENDED",
    "PAYMENT_FAILED_RETRY",
    "PAYMENT_FAILED_FINAL",
    "CHURN_RISK",
    "UPSELL_OPPORTUNITY",
    "WIN_BACK",
    "RENEWAL_REMINDER",
  ]),
});

export type ClientContext = z.infer<typeof ClientContextSchema>;

export const DraftSchema = z.object({
  smsBody: z.string().max(320),     // ≤ 2 SMS segments
  emailSubject: z.string().min(5).max(100),
  emailBody: z.string().min(80).max(1500),
  recommendedTier: z.enum(["BRONZE", "SILVER", "GOLD", "PLATINUM"]).nullable(),
  primaryCta: z.string().max(60),   // short label for a button
  primaryCtaUrl: z.string(),         // path like /agent/billing
  confidence: z.number().min(0).max(1),
  notes: z.string().max(400),       // internal notes for admin queue
});

export type Draft = z.infer<typeof DraftSchema>;

const SYSTEM_PROMPT = `
You write client-success messages for Nuru.com, an AI-native rental
marketplace in Kenya. Recipients are AGENTS or LANDLORDS who use the
platform to list properties.

# Hard rules
1. Match the user's preferredLang (en | sw | sheng — Kenyans often mix).
2. Plain Kenyan English by default. Friendly, concise, never pushy.
3. SMS body ≤ 320 chars. Email subject ≤ 100, body 80-1500 chars.
4. Recommend a tier based on listings count:
   - <5 listings → BRONZE
   - 5-20 → SILVER
   - 20-80 → GOLD
   - 80+ or PLATINUM signal in payload → PLATINUM
5. NEVER promise refunds, give legal advice, or lower the price.
6. NEVER threaten ("we will delete your data"). For TRIAL_ENDED, frame
   it as: listings will be paused (recoverable on subscribing).
7. Reference the user's actual usage when motivating them — "your 4
   listings have generated 28 inquiries this month."
8. Set confidence honestly: 0.9 = clean signal + standard ask; 0.6 =
   ambiguous; <0.5 = punt to admin.
9. Set primaryCtaUrl to a known path:
   - /agent/billing  (manage plan)
   - /agent          (back to dashboard)
   - /agent/new      (create first listing)

# Per kind
- ONBOARDING_NUDGE: signed up, 0 listings after 3 days. Encourage first
  listing in 60 seconds via AI photo upload.
- TRIAL_ENDING_3_DAYS / _TODAY: motivate plan choice using their usage stats.
- TRIAL_ENDED: listings paused; reactivate by subscribing.
- PAYMENT_FAILED_RETRY: STK push failed. Likely insufficient M-Pesa
  balance OR wrong phone. Walk through retry.
- PAYMENT_FAILED_FINAL: 3rd failure. Listings will pause. Suggest
  topping up M-Pesa OR contacting hello@nuru.com.
- CHURN_RISK: usage dropped sharply. Ask if anything's wrong; offer
  a brief check-in call (no calendar yet — say "reply if interested").
- UPSELL_OPPORTUNITY: hitting plan caps. Show stats + recommend next tier.
- WIN_BACK: canceled within 60 days. 30% off promo (placeholder; ops
  toggles real codes). Highlight what's new.
- RENEWAL_REMINDER: paid period ending. Soft confirmation it'll auto-charge.

# Output: STRICT JSON
{
  "smsBody": "string",
  "emailSubject": "string",
  "emailBody": "string with \\n\\n paragraph breaks",
  "recommendedTier": "BRONZE"|"SILVER"|"GOLD"|"PLATINUM"|null,
  "primaryCta": "string ≤60 chars",
  "primaryCtaUrl": "/agent/...",
  "confidence": 0.0-1.0,
  "notes": "string ≤400 chars; internal context for admin"
}
`.trim();

export async function draftClientSuccess(
  ctx: ClientContext,
  meta?: { actorId?: string | null; targetId?: string | null },
): Promise<RunResult<Draft>> {
  const safe = ClientContextSchema.parse(ctx);

  const userText = `
TaskKind: ${safe.taskKind}
User: name=${safe.user.name ?? "(unknown)"}, role=${safe.user.role}, lang=${safe.user.preferredLang}, daysSinceSignup=${safe.user.daysSinceSignup}
Subscription: tier=${safe.subscription.planTier}, status=${safe.subscription.status}, trialDaysLeft=${safe.subscription.daysUntilTrialEnd ?? "N/A"}, failedAttempts=${safe.subscription.failedAttempts}
Usage: activeListings=${safe.usage.activeListings}, inquiries30d=${safe.usage.totalInquiriesLast30d}, applications30d=${safe.usage.totalApplicationsLast30d}, rented=${safe.usage.totalRented}, lastLoginDaysAgo=${safe.usage.daysSinceLastLogin ?? "?"}

Draft the message as JSON.
  `.trim();

  const result = await run<Draft>({
    task: "auto_reply_draft",
    escalate: true,                // bump to Sonnet for quality
    systemPrompt: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userText }],
    jsonMode: true,
    maxOutputTokens: 1000,
    actorId: meta?.actorId ?? null,
    targetType: "agent_task",
    targetId: meta?.targetId ?? null,
  });
  const parsed = DraftSchema.parse(result.content);
  return { ...result, content: parsed };
}
