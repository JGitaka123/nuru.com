import { describe, expect, it } from "vitest";
import { heuristicParseSearchQuery, SearchFiltersSchema } from "./search-parser";

describe("heuristicParseSearchQuery", () => {
  it("parses the canonical query shape", () => {
    const f = heuristicParseSearchQuery("2BR Kilimani under 60K with parking");
    expect(f.neighborhoods).toEqual(["Kilimani"]);
    expect(f.bedroomsMin).toBe(2);
    expect(f.bedroomsMax).toBe(2);
    expect(f.rentMaxKes).toBe(60000);
    expect(f.category).toBe("TWO_BR");
    expect(f.mustHave).toContain("parking");
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
