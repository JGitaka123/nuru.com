/**
 * Search parser — turn natural language queries into structured filters
 * + a semantic query for vector search.
 *
 * Handles English, Swahili, and Sheng. Examples:
 *   "2BR Kilimani under 60k with parking"
 *   "natafuta nyumba 2BR Kile under 60K na parking"
 *   "place for me and my dog in Lavington, max 80k, near a school"
 *
 * Model: Haiku 4.5 (high volume, simple structured extraction).
 * Expected tokens: ~1.5K input (system) + ~200 output. With cache, effective
 * cost is ~$0.0008 per query — meaning 1M searches/year costs ~$800.
 */

import { z } from "zod";
import { run, type RunResult } from "../ai/router";

export const SearchFiltersSchema = z.object({
  neighborhoods: z.array(z.string()),
  bedroomsMin: z.number().int().nullable(),
  bedroomsMax: z.number().int().nullable(),
  rentMaxKes: z.number().int().nullable(),
  rentMinKes: z.number().int().nullable(),
  category: z
    .enum([
      "BEDSITTER",
      "STUDIO",
      "ONE_BR",
      "TWO_BR",
      "THREE_BR",
      "FOUR_PLUS_BR",
      "MAISONETTE",
      "TOWNHOUSE",
    ])
    .nullable(),
  mustHave: z.array(z.string()),
  niceToHave: z.array(z.string()),
  nearLandmarks: z.array(z.string()),
  semanticQuery: z.string().describe("Free-text intent for vector search"),
  clarifyingQuestion: z.string().nullable(),
  detectedLanguage: z.enum(["en", "sw", "sheng", "mixed"]),
});

export type SearchFilters = z.infer<typeof SearchFiltersSchema>;

const SYSTEM_PROMPT = `
You parse rental search queries for Nuru.com, a Nairobi rental marketplace.
Users may write in English, Swahili, Sheng, or a mix. Your job: extract
structured filters and produce a semantic query string for vector search.

# Known neighborhoods (canonical names)
Kilimani, Westlands, Kileleshwa, Lavington, Parklands, Karen, Runda, Spring
Valley, Riverside, Hurlingham, Upperhill, South B, South C, Lang'ata,
Donholm, Buruburu, Kasarani, Roysambu, Ruaka, Kikuyu, Ngong Road, Ngara,
Pangani, Eastleigh.

# Slang / Sheng map (apply silently — never echo back)
- Kile = Kileleshwa
- Kili = Kilimani (context-dependent)
- West = Westlands
- Lavi = Lavington
- keja, hao, hao kabambe = a place / a nice place
- pango = rent
- nikitafuta / natafuta / nataka = I'm looking for / I want
- na = and / with
- elfu / k = thousand (60K = 60000)
- bei = price
- bei ya pango = rent price

# Rules
1. Map all neighborhoods to canonical English names.
2. "60K", "60k", "elfu sitini" all → 60000.
3. If the user says "under X", set rentMaxKes = X.
4. If they say "around X" or "X budget", set rentMaxKes = X * 1.1 (round up).
5. If bedrooms not specified, leave bedroomsMin/Max null. Don't guess.
6. mustHave: features the user EXPLICITLY required (parking, pet-friendly,
   borehole, balcony, lift, furnished, etc.). Use snake_case.
7. niceToHave: features mentioned positively but not required.
8. semanticQuery: a clean English summary of the intent for vector search.
   Strip neighborhoods/prices (already filtered). Keep lifestyle and
   subjective bits. E.g. "quiet residential family-friendly near schools".
9. clarifyingQuestion: only if the query is genuinely ambiguous (e.g. no
   location AND no budget AND no bedrooms). Keep to one short question.
   Otherwise null.
10. Output strict JSON, nothing else.

# Output schema
{
  "neighborhoods": [string],
  "bedroomsMin": int|null, "bedroomsMax": int|null,
  "rentMaxKes": int|null, "rentMinKes": int|null,
  "category": "BEDSITTER|STUDIO|ONE_BR|TWO_BR|THREE_BR|FOUR_PLUS_BR|MAISONETTE|TOWNHOUSE"|null,
  "mustHave": [string], "niceToHave": [string],
  "nearLandmarks": [string],
  "semanticQuery": string,
  "clarifyingQuestion": string|null,
  "detectedLanguage": "en"|"sw"|"sheng"|"mixed"
}

# Examples

Query: "2BR Kilimani under 60K with parking"
{
  "neighborhoods": ["Kilimani"], "bedroomsMin": 2, "bedroomsMax": 2,
  "rentMaxKes": 60000, "rentMinKes": null, "category": "TWO_BR",
  "mustHave": ["parking"], "niceToHave": [], "nearLandmarks": [],
  "semanticQuery": "two bedroom apartment with parking",
  "clarifyingQuestion": null, "detectedLanguage": "en"
}

Query: "natafuta keja Kile na pet zangu, around 80k"
{
  "neighborhoods": ["Kileleshwa"], "bedroomsMin": null, "bedroomsMax": null,
  "rentMaxKes": 88000, "rentMinKes": null, "category": null,
  "mustHave": ["pet_friendly"], "niceToHave": [], "nearLandmarks": [],
  "semanticQuery": "rental that allows pets",
  "clarifyingQuestion": "How many bedrooms do you need?",
  "detectedLanguage": "sheng"
}

Query: "somewhere quiet for my family, near a good school, max 120k"
{
  "neighborhoods": [], "bedroomsMin": null, "bedroomsMax": null,
  "rentMaxKes": 120000, "rentMinKes": null, "category": null,
  "mustHave": [], "niceToHave": ["near_school"], "nearLandmarks": [],
  "semanticQuery": "quiet family-friendly residential area near schools",
  "clarifyingQuestion": "Which area do you prefer — Lavington, Karen, Runda, or somewhere else?",
  "detectedLanguage": "en"
}
`.trim();

export async function parseSearchQuery(query: string): Promise<RunResult<SearchFilters>> {
  const result = await run<SearchFilters>({
    task: "search_parse",
    systemPrompt: SYSTEM_PROMPT,
    messages: [{ role: "user", content: `Query: "${query}"\n\nOutput JSON only.` }],
    jsonMode: true,
    maxOutputTokens: 400,
  });

  const parsed = SearchFiltersSchema.parse(result.content);
  return { ...result, content: parsed };
}
