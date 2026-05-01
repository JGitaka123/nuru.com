/**
 * Listing generator — turn agent photos into a complete listing.
 *
 * Input: 3-10 photos of a property + minimal agent input (neighborhood,
 * sometimes a hint like "2BR with parking").
 * Output: structured listing draft for the agent to review and publish.
 *
 * Model: Sonnet 4.6 (vision required, structured output reliability).
 * Expected tokens: ~2K input (system) + ~500 output. With cache hit on
 * system prompt, effective cost is ~$0.008 per call.
 */

import { z } from "zod";
import { run, runVision, type RunResult } from "../ai/router";

export const ListingDraftSchema = z.object({
  title: z.string().max(80).describe("Concise, factual, no superlatives"),
  description: z.string().min(80).max(700).describe("80-150 words, factual"),
  category: z.enum([
    "BEDSITTER",
    "STUDIO",
    "ONE_BR",
    "TWO_BR",
    "THREE_BR",
    "FOUR_PLUS_BR",
    "MAISONETTE",
    "TOWNHOUSE",
  ]),
  bedrooms: z.number().int().min(0).max(10),
  bathrooms: z.number().int().min(1).max(10),
  features: z.array(
    z.enum([
      "balcony",
      "en_suite",
      "borehole",
      "backup_generator",
      "parking",
      "lift",
      "gym",
      "swimming_pool",
      "garden",
      "servant_quarter",
      "cctv",
      "gated_compound",
      "fibre_internet",
      "fitted_kitchen",
      "pet_friendly",
      "furnished",
    ])
  ),
  estimatedRentKesLow: z.number().int().min(5000).max(1_000_000),
  estimatedRentKesHigh: z.number().int().min(5000).max(1_000_000),
  pricingNotes: z.string().describe("One sentence on price reasoning"),
  qualityIssues: z.array(
    z.enum([
      "dark_lighting",
      "blurry_photos",
      "watermark_detected",
      "vertical_orientation",
      "clutter",
      "missing_kitchen",
      "missing_bathroom",
      "missing_bedroom",
      "missing_exterior",
    ])
  ),
  missingPhotos: z.array(z.string()).describe("E.g. ['kitchen', 'main bathroom']"),
  confidence: z.number().min(0).max(1),
});

export type ListingDraft = z.infer<typeof ListingDraftSchema>;

const SYSTEM_PROMPT = `
You are a real estate listing assistant for Nairobi's long-term rental market.
You analyze photos of a property and produce a structured listing draft that
the agent will review before publishing on Nuru.com.

# Your job
- Look at the photos and the minimal agent input.
- Extract verifiable features (balcony, parking, en-suite, borehole, etc.).
- Write a factual, professional title and description.
- Estimate a fair rent range based on Nairobi neighborhood norms.
- Flag any quality or trust issues with the photos.
- Note what photos are missing for a complete listing.

# Hard rules
1. NEVER invent features you can't see in the photos. If you can't tell
   whether there's a borehole, do NOT list it. Underclaiming is fine;
   overclaiming destroys trust.
2. NEVER use marketing superlatives. Banned words: "luxurious", "stunning",
   "amazing", "breathtaking", "must-see", "rare gem", "one of a kind",
   "unique opportunity", "won't last".
3. If you see a watermark, agency logo, or text overlay from another
   platform (Jiji, Property24, BuyRentKenya, etc.), set quality_issues to
   include "watermark_detected". This may indicate stolen photos.
4. Pricing must reflect Nairobi reality (April 2026):
   - Kilimani 1BR: 35-55K, 2BR: 55-90K, 3BR: 90-150K
   - Westlands 1BR: 50-80K, 2BR: 80-130K, 3BR: 130-200K
   - Kileleshwa 1BR: 40-60K, 2BR: 65-100K, 3BR: 100-160K
   - Lavington 1BR: 45-70K, 2BR: 70-120K, 3BR: 120-180K
   - Parklands 1BR: 30-50K, 2BR: 50-80K, 3BR: 80-130K
   For furnished or serviced, add 30-60%.
5. Description must be 80-150 words. Mention water reliability, power
   backup, security, and parking if visible. Use plain Kenyan English.
6. Always output valid JSON matching the schema. No prose outside the JSON.

# Output schema (strict)
{
  "title": "string, ≤80 chars",
  "description": "string, 80-700 chars",
  "category": "BEDSITTER|STUDIO|ONE_BR|TWO_BR|THREE_BR|FOUR_PLUS_BR|MAISONETTE|TOWNHOUSE",
  "bedrooms": int,
  "bathrooms": int,
  "features": [<from allowed list>],
  "estimatedRentKesLow": int,
  "estimatedRentKesHigh": int,
  "pricingNotes": "string, one sentence",
  "qualityIssues": [<from allowed list>],
  "missingPhotos": ["kitchen", "bathroom", ...],
  "confidence": 0.0-1.0
}

Allowed features: balcony, en_suite, borehole, backup_generator, parking,
lift, gym, swimming_pool, garden, servant_quarter, cctv, gated_compound,
fibre_internet, fitted_kitchen, pet_friendly, furnished.

Allowed quality issues: dark_lighting, blurry_photos, watermark_detected,
vertical_orientation, clutter, missing_kitchen, missing_bathroom,
missing_bedroom, missing_exterior.
`.trim();

export interface GenerateListingInput {
  photoUrls: string[];           // R2 public URLs
  neighborhood: string;          // required from agent
  agentHint?: string;            // optional free-text hint
  /** Caller context for ML capture. */
  meta?: { actorId?: string | null; targetId?: string | null };
}

export async function generateListing(
  input: GenerateListingInput
): Promise<RunResult<ListingDraft>> {
  const userText = `
Neighborhood: ${input.neighborhood}
${input.agentHint ? `Agent hint: ${input.agentHint}` : ""}

Analyze the attached photos and produce the listing draft as JSON.
  `.trim();

  const result = await runVision<ListingDraft>({
    task: "listing_generate",
    systemPrompt: SYSTEM_PROMPT,
    messages: [],            // overridden by runVision
    imageUrls: input.photoUrls,
    userText,
    jsonMode: true,
    maxOutputTokens: 1500,
    actorId: input.meta?.actorId ?? null,
    targetType: "listing",
    targetId: input.meta?.targetId ?? null,
  });

  // Validate. If the model drifts, this throws and we surface it loudly.
  const parsed = ListingDraftSchema.parse(result.content);
  return { ...result, content: parsed };
}
