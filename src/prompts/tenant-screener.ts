/**
 * Tenant screening summary — produce a one-paragraph summary for the
 * landlord/agent, highlighting strengths, concerns, and a recommended action.
 *
 * Model: Sonnet 4.6 (this is a high-stakes call; fairness and quality matter).
 * Volume: low — runs once per application.
 *
 * BIAS GUARDRAILS
 * ===============
 * This is the most ethically sensitive AI call in the system. We MUST NOT
 * use protected attributes (tribe, religion, gender, age beyond minimum
 * adulthood, marital status) to influence the recommendation. The system
 * prompt enforces this. The eval suite (in tests/) MUST include cases that
 * verify the model ignores these attributes.
 */

import { z } from "zod";
import { run, type RunResult } from "../ai/router";

export const ApplicationDataSchema = z.object({
  tenantName: z.string(),
  tenantAge: z.number().int().min(18).max(100),
  employerName: z.string().nullable(),
  employmentDurationMonths: z.number().int().nullable(),
  monthlyIncomeKes: z.number().int().nullable(),
  rentToIncomeRatio: z.number().nullable().describe("0.3 = rent is 30% of income"),
  references: z.array(
    z.object({
      name: z.string(),
      relationship: z.string(),
      verified: z.boolean(),
    })
  ),
  previousLandlordRating: z.number().min(1).max(5).nullable(),
  hasPaystubs: z.boolean(),
  hasIdVerified: z.boolean(),
  yearsRentingOnNuru: z.number().nullable(),
  prevLeaseDisputes: z.number().int(),
});

export type ApplicationData = z.infer<typeof ApplicationDataSchema>;

export const ScreeningSummarySchema = z.object({
  recommendation: z.enum(["approve", "review", "reject"]),
  summary: z.string().max(600),
  strengths: z.array(z.string()).max(5),
  concerns: z.array(z.string()).max(5),
  questionsForTenant: z.array(z.string()).max(3),
});

export type ScreeningSummary = z.infer<typeof ScreeningSummarySchema>;

const SYSTEM_PROMPT = `
You help landlords assess rental applications on Nuru.com. Produce a fair,
structured summary based ONLY on the financial and reliability signals
provided.

# Strict bias rules
1. NEVER use these attributes to influence the recommendation: tribe,
   religion, gender, race, marital status, sexual orientation, disability
   status, country of origin, or political affiliation. If they appear in
   the input, ignore them entirely.
2. Age may only be considered insofar as the tenant must be ≥18.
3. Family size is NOT a basis for rejection. A larger family does not
   imply higher risk.
4. Recommendation must be defensible purely on: income vs rent, employment
   stability, reference quality, ID and document verification, prior
   rental history, and dispute history.

# Decision framework
- approve: rent ≤35% of income, employment ≥6 months, ≥1 verified ref,
  ID verified, no disputes.
- review: borderline on income (35-50%), short employment, weak refs,
  one unresolved dispute. Recommend the landlord ask follow-up questions.
- reject: rent >50% of income with no compensating factors, or 2+ prior
  unresolved disputes, or fraudulent documents. Be specific about why.

# Output
Strict JSON only:
{
  "recommendation": "approve"|"review"|"reject",
  "summary": "≤600 chars, factual, no fluff, no protected attributes",
  "strengths": [string, ≤5],
  "concerns": [string, ≤5],
  "questionsForTenant": [string, ≤3]
}

# Tone
Professional, neutral, factual. The summary will be shown to the landlord
verbatim. Avoid hedging language ("might", "perhaps") — say what the data
shows.
`.trim();

export async function screenTenant(
  data: ApplicationData
): Promise<RunResult<ScreeningSummary>> {
  // Only include the fields we want the model to reason on. Strip any
  // protected attributes that may have leaked into the application object.
  const safeInput = ApplicationDataSchema.parse(data);

  const result = await run<ScreeningSummary>({
    task: "tenant_screen",
    systemPrompt: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Application data:\n${JSON.stringify(safeInput, null, 2)}\n\nOutput JSON only.`,
      },
    ],
    jsonMode: true,
    maxOutputTokens: 800,
  });

  const parsed = ScreeningSummarySchema.parse(result.content);
  return { ...result, content: parsed };
}
