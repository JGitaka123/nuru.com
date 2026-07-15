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
import { allSearchablePlaces, canonicalCounty, countyForArea } from "../lib/locations";

export const SearchFiltersSchema = z.object({
  listingType: z.enum(["RENT", "SALE"]).default("RENT"),
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
You parse property search queries for Nuru.com, a nationwide Kenyan property
marketplace (rentals and homes for sale, everywhere in Kenya — not just
Nairobi). Users may write in English, Swahili, Sheng, or a mix. Your job:
extract structured filters and produce a semantic query string for vector
search.

# Locations (anywhere in Kenya)
Return whatever place the user names in "neighborhoods" — it may be an estate
or area (Kilimani, Nyali, Milimani, Elgon View), a town (Thika, Naivasha,
Ukunda), or a county/city (Nairobi, Mombasa, Kisumu, Nakuru, Eldoret,
Machakos, Kiambu, Nyeri, Kilifi, ...). Use the canonical, correctly-cased
name. Major markets and their areas:
- Nairobi: Kilimani, Westlands, Kileleshwa, Lavington, Karen, Runda,
  Parklands, Upperhill, South B/C, Lang'ata, Donholm, Kasarani, Ruaka, Embakasi.
- Mombasa: Nyali, Bamburi, Shanzu, Kizingo, Tudor, Mtwapa, Likoni.
- Kisumu: Milimani, Mamboleo, Riat, Nyalenda, Kondele.
- Nakuru: Milimani, Section 58, Lanet, Naivasha, Gilgil.
- Eldoret (Uasin Gishu): Elgon View, Kapsoya, Annex, Kimumu.
- Kiambu: Thika, Ruiru, Juja, Kikuyu, Kiambu Town, Kitengela (Kajiado/Machakos).
Do not restrict to this list — accept any Kenyan place the user names.

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
1. Map all locations to their canonical, correctly-cased names.
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
10. listingType: "SALE" if the user wants to BUY/purchase a property
    ("for sale", "buy", "purchase", "kununua", "nunua", "own"). Otherwise
    "RENT" (the default — renting/letting, "to let", "kukodi", "keja").
    When SALE, treat any budget figure as a total asking price, not rent,
    and leave rentMaxKes/rentMinKes null.
11. Output strict JSON, nothing else.

# Output schema
{
  "listingType": "RENT"|"SALE",
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
  "listingType": "RENT",
  "neighborhoods": ["Kilimani"], "bedroomsMin": 2, "bedroomsMax": 2,
  "rentMaxKes": 60000, "rentMinKes": null, "category": "TWO_BR",
  "mustHave": ["parking"], "niceToHave": [], "nearLandmarks": [],
  "semanticQuery": "two bedroom apartment with parking",
  "clarifyingQuestion": null, "detectedLanguage": "en"
}

Query: "3 bedroom house for sale in Lavington"
{
  "listingType": "SALE",
  "neighborhoods": ["Lavington"], "bedroomsMin": 3, "bedroomsMax": 3,
  "rentMaxKes": null, "rentMinKes": null, "category": "THREE_BR",
  "mustHave": [], "niceToHave": [], "nearLandmarks": [],
  "semanticQuery": "three bedroom house to buy",
  "clarifyingQuestion": null, "detectedLanguage": "en"
}

Query: "natafuta keja Kile na pet zangu, around 80k"
{
  "listingType": "RENT",
  "neighborhoods": ["Kileleshwa"], "bedroomsMin": null, "bedroomsMax": null,
  "rentMaxKes": 88000, "rentMinKes": null, "category": null,
  "mustHave": ["pet_friendly"], "niceToHave": [], "nearLandmarks": [],
  "semanticQuery": "rental that allows pets",
  "clarifyingQuestion": "How many bedrooms do you need?",
  "detectedLanguage": "sheng"
}

Query: "somewhere quiet for my family, near a good school, max 120k"
{
  "listingType": "RENT",
  "neighborhoods": [], "bedroomsMin": null, "bedroomsMax": null,
  "rentMaxKes": 120000, "rentMinKes": null, "category": null,
  "mustHave": [], "niceToHave": ["near_school"], "nearLandmarks": [],
  "semanticQuery": "quiet family-friendly residential area near schools",
  "clarifyingQuestion": "Which town or area are you looking in?",
  "detectedLanguage": "en"
}

Query: "2 bedroom in Nyali Mombasa near the beach, 70k"
{
  "listingType": "RENT",
  "neighborhoods": ["Nyali"], "bedroomsMin": 2, "bedroomsMax": 2,
  "rentMaxKes": 70000, "rentMinKes": null, "category": "TWO_BR",
  "mustHave": [], "niceToHave": ["near_beach"], "nearLandmarks": ["beach"],
  "semanticQuery": "two bedroom apartment near the beach",
  "clarifyingQuestion": null, "detectedLanguage": "en"
}

Query: "bungalow ya kununua Nakuru, 8M"
{
  "listingType": "SALE",
  "neighborhoods": ["Nakuru"], "bedroomsMin": null, "bedroomsMax": null,
  "rentMaxKes": null, "rentMinKes": null, "category": null,
  "mustHave": [], "niceToHave": [], "nearLandmarks": [],
  "semanticQuery": "bungalow for sale",
  "clarifyingQuestion": "How many bedrooms?", "detectedLanguage": "sheng"
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

// Sheng / short-form aliases the registry can't infer on its own.
const NEIGHBORHOOD_ALIASES: Record<string, string> = {
  westy: "Westlands",
  kile: "Kileleshwa",
  lavi: "Lavington",
  rongai: "Ongata Rongai",
  eldy: "Eldoret CBD",
  nax: "Nakuru CBD",
};

// Every canonical Kenyan place (areas + counties), lowercased for matching.
// Longest names first so "Nairobi CBD" wins over "Nairobi".
const SEARCHABLE_PLACES: string[] = allSearchablePlaces().sort((a, b) => b.length - a.length);

const FEATURE_KEYWORDS: Record<string, string> = {
  parking: "parking",
  borehole: "borehole",
  cctv: "cctv",
  generator: "backup_generator",
  backup: "backup_generator",
  gym: "gym",
  pool: "swimming_pool",
  swimming: "swimming_pool",
  balcony: "balcony",
  furnished: "furnished",
  dsq: "dsq",
  lift: "lift",
  elevator: "lift",
  wifi: "wifi",
  "pet": "pets_allowed",
  pets: "pets_allowed",
};

/**
 * Deterministic fallback parser — used when the Claude API is unreachable
 * so search degrades to structured filters instead of failing outright.
 * Handles the common shapes: "2BR Kilimani under 60K with parking".
 */
export function heuristicParseSearchQuery(query: string): SearchFilters {
  const q = query.toLowerCase();

  // Match canonical places from the national registry, plus Sheng aliases.
  const matched = new Set<string>();
  for (const place of SEARCHABLE_PLACES) {
    // Escape regex metachars in place names (e.g. "Lang'ata", "South B").
    const safe = place.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`\\b${safe}\\b`, "i").test(q)) matched.add(place);
  }
  for (const [alias, canonical] of Object.entries(NEIGHBORHOOD_ALIASES)) {
    if (new RegExp(`\\b${alias}\\b`, "i").test(q)) matched.add(canonical);
  }
  // Drop a bare county match when a more specific area within it also matched
  // (e.g. "Nyali Mombasa" → keep "Nyali", drop "Mombasa" so results narrow).
  const all = [...matched];
  const neighborhoods = all.filter((place) => {
    const asCounty = canonicalCounty(place);
    if (!asCounty) return true; // not a county name → always keep
    const hasAreaInCounty = all.some((o) => o !== place && countyForArea(o) === asCounty);
    return !hasAreaInCounty;
  });

  // "2BR", "2 br", "2 bed(room)s", "three bedroom"
  let bedrooms: number | null = null;
  const bedDigit = q.match(/(\d)\s*(?:br\b|bed)/);
  if (bedDigit) bedrooms = parseInt(bedDigit[1], 10);
  else {
    const words: Record<string, number> = { one: 1, two: 2, three: 3, four: 4 };
    const bedWord = q.match(/\b(one|two|three|four)\s*(?:br\b|bed)/);
    if (bedWord) bedrooms = words[bedWord[1]];
  }
  const isBedsitter = /\bbedsitter\b/.test(q);
  const isStudio = /\bstudio\b/.test(q);

  // Buy vs rent intent.
  const listingType: "RENT" | "SALE" =
    /\b(for sale|to buy|buy|purchase|kununua|nunua)\b/.test(q) ? "SALE" : "RENT";

  // Money: "under 60k", "max 80,000", "around 80k", "60k-80k", "below 100000".
  // Bare "NNk"/large numbers are treated as a budget ceiling.
  const toKes = (s: string): number => {
    const n = parseFloat(s.replace(/,/g, ""));
    return /k$/i.test(s.trim()) ? Math.round(n * 1000) : Math.round(n);
  };
  const money = "((?:\\d[\\d,]*(?:\\.\\d+)?)\\s*k?)";
  let rentMaxKes: number | null = null;
  let rentMinKes: number | null = null;
  const range = q.match(new RegExp(`${money}\\s*(?:-|to)\\s*${money}`, "i"));
  const capped = q.match(new RegExp(`(?:under|below|max|chini ya|less than|around|about|~)\\s*${money}`, "i"));
  const bare = q.match(/\b(\d{2,3}k|\d{5,6})\b/i);
  if (range) {
    rentMinKes = toKes(range[1]);
    rentMaxKes = toKes(range[2]);
  } else if (capped) {
    rentMaxKes = toKes(capped[1]);
  } else if (bare) {
    rentMaxKes = toKes(bare[1]);
  }
  // Guard nonsense: rents outside 3K–1M KES are almost certainly misparses.
  if (rentMaxKes !== null && (rentMaxKes < 3000 || rentMaxKes > 1_000_000)) rentMaxKes = null;
  if (rentMinKes !== null && (rentMinKes < 3000 || rentMinKes > 1_000_000)) rentMinKes = null;

  const mustHave = [
    ...new Set(
      Object.entries(FEATURE_KEYWORDS)
        .filter(([kw]) => new RegExp(`\\b${kw}`, "i").test(q))
        .map(([, feature]) => feature),
    ),
  ];

  const category = isBedsitter
    ? ("BEDSITTER" as const)
    : isStudio
      ? ("STUDIO" as const)
      : bedrooms === 1
        ? ("ONE_BR" as const)
        : bedrooms === 2
          ? ("TWO_BR" as const)
          : bedrooms === 3
            ? ("THREE_BR" as const)
            : bedrooms !== null && bedrooms >= 4
              ? ("FOUR_PLUS_BR" as const)
              : null;

  return {
    listingType,
    neighborhoods,
    bedroomsMin: bedrooms,
    bedroomsMax: bedrooms,
    // For SALE queries the parsed budget is an asking price, not rent.
    rentMaxKes: listingType === "SALE" ? null : rentMaxKes,
    rentMinKes: listingType === "SALE" ? null : rentMinKes,
    category,
    mustHave,
    niceToHave: [],
    nearLandmarks: [],
    semanticQuery: query,
    clarifyingQuestion: null,
    detectedLanguage: "en",
  };
}
