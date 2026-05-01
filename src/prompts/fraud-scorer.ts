/**
 * Fraud scorer — given a listing's signals, produce a risk score 0-100
 * with explanation.
 *
 * Designed to be called nightly via Batch API (50% off) for all active
 * listings, plus on-demand when a listing is created or edited.
 *
 * Model: Sonnet 4.6 (reasoning matters; cheaper models miss combinations
 * of weak signals that together indicate fraud).
 *
 * Inputs are pre-computed signals — we don't ask Claude to access external
 * systems. This keeps the call cheap and deterministic.
 */

import { z } from "zod";
import { run, type RunResult } from "../ai/router";

export const FraudSignalsSchema = z.object({
  listingId: z.string(),
  agentTrustScore: z.number().int().min(0).max(100),
  agentAccountAgeDays: z.number().int(),
  agentVerified: z.boolean(),
  rentVsMarketMedianRatio: z.number().describe("1.0 = at market, 0.5 = half"),
  photoCount: z.number().int(),
  hasWatermark: z.boolean(),
  reverseImageMatches: z.number().int().describe("Same images on other sites"),
  duplicateOfActiveListings: z.number().int().describe("Same photos elsewhere on Nuru"),
  descriptionLength: z.number().int(),
  hasContactInDescription: z.boolean(),
  daysSinceCreated: z.number().int(),
  inquiriesCount: z.number().int(),
  viewingsBookedCount: z.number().int(),
  viewingsCompletedCount: z.number().int(),
  reportsCount: z.number().int(),
});

export type FraudSignals = z.infer<typeof FraudSignalsSchema>;

export const FraudScoreSchema = z.object({
  score: z.number().int().min(0).max(100).describe("Higher = riskier"),
  flags: z.array(z.string()),
  recommendation: z.enum(["allow", "review", "hide", "remove"]),
  reasoning: z.string().max(400),
});

export type FraudScore = z.infer<typeof FraudScoreSchema>;

const SYSTEM_PROMPT = `
You are a fraud analyst for Nuru.com, a Kenyan rental marketplace. You
evaluate a listing's risk signals and assign a fraud score 0-100, where
higher means riskier.

# Common Kenya rental scam patterns
1. Stolen photos: same images appear on other sites (Jiji, Property24).
   Signal: reverseImageMatches > 0 OR hasWatermark = true.
2. Bait pricing: rent dramatically below market to harvest contacts.
   Signal: rentVsMarketMedianRatio < 0.6.
3. Throwaway accounts: brand-new agents posting many listings.
   Signal: agentAccountAgeDays < 14 AND not verified.
4. Contact-leak listings: phone number / WhatsApp in description to
   bypass our messaging. Signal: hasContactInDescription = true.
5. Duplicate listings: same property posted multiple times.
   Signal: duplicateOfActiveListings > 0.
6. High-traffic, low-conversion: many inquiries but no completed viewings.
   Signal: inquiriesCount > 20 AND viewingsCompletedCount = 0 AND
   daysSinceCreated > 14.
7. Reported by users: any reportsCount > 0 deserves attention.

# Scoring guidance
- 0-20: clean. Allow.
- 21-40: minor issues (e.g. one weak signal). Allow but note.
- 41-60: review. Send to human moderator.
- 61-80: hide from search until reviewed.
- 81-100: remove and notify the agent.

A single severe signal (e.g. confirmed stolen photos) can push directly
to 80+. Multiple weak signals compound — three weak signals around a new
agent should land in the 50-70 range.

A high agentTrustScore (>70) and verified status can DAMPEN risk by ~15
points unless the signal is severe (stolen photos, reports).

# Output
Strict JSON only:
{
  "score": int 0-100,
  "flags": [<machine-readable codes>],
  "recommendation": "allow"|"review"|"hide"|"remove",
  "reasoning": "string, ≤400 chars, factual, no fluff"
}

Allowed flags: stolen_photos, bait_pricing, throwaway_account,
contact_leak, duplicate_listing, low_conversion, user_reports,
underpriced, overpriced, sparse_listing, unverified_new_agent.
`.trim();

export async function scoreFraud(signals: FraudSignals): Promise<RunResult<FraudScore>> {
  const result = await run<FraudScore>({
    task: "fraud_score",
    systemPrompt: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Signals:\n${JSON.stringify(signals, null, 2)}\n\nOutput JSON only.`,
      },
    ],
    jsonMode: true,
    maxOutputTokens: 600,
  });

  const parsed = FraudScoreSchema.parse(result.content);
  return { ...result, content: parsed };
}
