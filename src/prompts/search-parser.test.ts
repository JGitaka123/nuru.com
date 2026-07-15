import { describe, expect, it } from "vitest";
import { heuristicParseSearchQuery, parseSearchQuery, SearchFiltersSchema } from "./search-parser";

describe("heuristicParseSearchQuery", () => {
  it("parses the canonical query shape", () => {
    const f = heuristicParseSearchQuery("2BR Kilimani under 60K with parking");
    expect(f.listingType).toBe("RENT");
    expect(f.neighborhoods).toEqual(["Kilimani"]);
    expect(f.bedroomsMin).toBe(2);
    expect(f.bedroomsMax).toBe(2);
    expect(f.rentMaxKes).toBe(60000);
    expect(f.category).toBe("TWO_BR");
    expect(f.mustHave).toContain("parking");
  });

  it("detects buy/sale intent and drops rent budget", () => {
    const f = heuristicParseSearchQuery("3 bedroom house for sale in Lavington");
    expect(f.listingType).toBe("SALE");
    expect(f.neighborhoods).toEqual(["Lavington"]);
    expect(f.category).toBe("THREE_BR");
    expect(f.rentMaxKes).toBeNull();
    const sw = heuristicParseSearchQuery("nataka kununua nyumba Karen");
    expect(sw.listingType).toBe("SALE");
    // Plain rental query stays RENT.
    expect(heuristicParseSearchQuery("2BR Kilimani to let").listingType).toBe("RENT");
  });

  it("always produces schema-valid output", () => {
    for (const q of [
      "2BR Kilimani under 60K with parking",
      "natafuta keja Kile na pet zangu, around 80k",
      "quiet family-friendly Lavington max 120k",
      "bedsitter",
      "anything at all !!!",
      "",
    ]) {
      expect(() => SearchFiltersSchema.parse(heuristicParseSearchQuery(q))).not.toThrow();
    }
  });

  it("understands neighborhood aliases", () => {
    expect(heuristicParseSearchQuery("keja Kile 80k").neighborhoods).toEqual(["Kileleshwa"]);
    expect(heuristicParseSearchQuery("westy studio").neighborhoods).toEqual(["Westlands"]);
  });

  it("parses price ranges and bare budgets", () => {
    const range = heuristicParseSearchQuery("2 bed 50k-80k");
    expect(range.rentMinKes).toBe(50000);
    expect(range.rentMaxKes).toBe(80000);

    const bare = heuristicParseSearchQuery("keja around 80k Kile");
    expect(bare.rentMaxKes).toBe(80000);

    const plain = heuristicParseSearchQuery("apartment 45000");
    expect(plain.rentMaxKes).toBe(45000);
  });

  it("rejects nonsense rents", () => {
    // "2" from "2BR" must not become a 2 KES budget.
    const f = heuristicParseSearchQuery("2BR apartment");
    expect(f.rentMaxKes).toBeNull();
  });

  it("maps word bedrooms and categories", () => {
    expect(heuristicParseSearchQuery("three bedroom Lavington").category).toBe("THREE_BR");
    expect(heuristicParseSearchQuery("bedsitter Parklands").category).toBe("BEDSITTER");
    expect(heuristicParseSearchQuery("studio westlands").category).toBe("STUDIO");
  });

  it("extracts multiple features", () => {
    const f = heuristicParseSearchQuery("2br with parking, borehole and cctv");
    expect(f.mustHave).toEqual(expect.arrayContaining(["parking", "borehole", "cctv"]));
  });
});

// Live evals — real Claude calls, gated on RUN_REAL_AI_EVALS. Text-only
// (Haiku, ~$0.001/case), so unlike the vision evals they need no fixture
// bucket and can run straight from CI.
describe("parseSearchQuery [eval]", () => {
  it.skipIf(!process.env.RUN_REAL_AI_EVALS)(
    "parses the canonical English query",
    async () => {
      const r = await parseSearchQuery("2BR Kilimani under 60K with parking");
      expect(r.content.neighborhoods).toContain("Kilimani");
      expect(r.content.rentMaxKes).toBe(60000);
      expect([r.content.bedroomsMin, r.content.bedroomsMax]).toContain(2);
      expect(r.content.mustHave.join(" ")).toMatch(/parking/i);
    },
    60_000,
  );

  it.skipIf(!process.env.RUN_REAL_AI_EVALS)(
    "parses Sheng with a pet requirement",
    async () => {
      const r = await parseSearchQuery("natafuta keja Kile na pet zangu, around 80k");
      expect(r.content.neighborhoods).toContain("Kileleshwa");
      expect(r.content.rentMaxKes).toBeGreaterThanOrEqual(70000);
      expect(r.content.rentMaxKes).toBeLessThanOrEqual(90000);
      expect(["sw", "sheng", "mixed"]).toContain(r.content.detectedLanguage);
    },
    60_000,
  );
});
