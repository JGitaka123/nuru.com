import { describe, it, expect } from "vitest";
import { matches, SavedSearchInputSchema } from "./saved-searches";

const baseListing = {
  id: "l1",
  title: "Modern 2BR Apartment",
  neighborhood: "Kilimani",
  bedrooms: 2,
  rentKesCents: 6_000_000, // KES 60,000
  features: ["Parking", "Balcony", "Gym"],
  publishedAt: new Date("2026-05-01T00:00:00Z"),
  primaryPhotoKey: "photo.jpg",
};

const noFilters = {
  neighborhoods: [],
  bedroomsMin: null,
  bedroomsMax: null,
  rentMaxKesCents: null,
  rentMinKesCents: null,
  mustHave: [],
};

describe("matches", () => {
  it("matches anything when no filters are set", () => {
    expect(matches(noFilters, baseListing)).toBe(true);
  });

  describe("neighborhood", () => {
    it("matches when listing neighborhood is in the saved-search list", () => {
      expect(matches({ ...noFilters, neighborhoods: ["kilimani", "westlands"] }, baseListing)).toBe(true);
    });

    it("rejects when listing neighborhood is not in the saved-search list", () => {
      expect(matches({ ...noFilters, neighborhoods: ["lavington"] }, baseListing)).toBe(false);
    });

    it("lowercases the listing-side neighborhood before comparing", () => {
      // Saved input is canonical lowercase (per SavedSearchInputSchema);
      // listings can be any case, so the matcher normalizes them.
      expect(matches({ ...noFilters, neighborhoods: ["kilimani"] }, { ...baseListing, neighborhood: "KILIMANI" })).toBe(true);
    });
  });

  describe("bedrooms", () => {
    it("rejects when below bedroomsMin", () => {
      expect(matches({ ...noFilters, bedroomsMin: 3 }, baseListing)).toBe(false);
    });

    it("matches at the bedroomsMin boundary", () => {
      expect(matches({ ...noFilters, bedroomsMin: 2 }, baseListing)).toBe(true);
    });

    it("rejects when above bedroomsMax", () => {
      expect(matches({ ...noFilters, bedroomsMax: 1 }, baseListing)).toBe(false);
    });

    it("matches at the bedroomsMax boundary", () => {
      expect(matches({ ...noFilters, bedroomsMax: 2 }, baseListing)).toBe(true);
    });
  });

  describe("rent", () => {
    it("rejects when rent exceeds rentMaxKesCents", () => {
      expect(matches({ ...noFilters, rentMaxKesCents: 5_000_000 }, baseListing)).toBe(false);
    });

    it("matches at the rentMaxKesCents boundary", () => {
      expect(matches({ ...noFilters, rentMaxKesCents: 6_000_000 }, baseListing)).toBe(true);
    });

    it("rejects when rent is below rentMinKesCents", () => {
      expect(matches({ ...noFilters, rentMinKesCents: 7_000_000 }, baseListing)).toBe(false);
    });

    it("matches at the rentMinKesCents boundary", () => {
      expect(matches({ ...noFilters, rentMinKesCents: 6_000_000 }, baseListing)).toBe(true);
    });
  });

  describe("mustHave features", () => {
    it("matches when listing has every required feature", () => {
      expect(matches({ ...noFilters, mustHave: ["parking", "balcony"] }, baseListing)).toBe(true);
    });

    it("rejects when listing is missing a required feature", () => {
      expect(matches({ ...noFilters, mustHave: ["parking", "pool"] }, baseListing)).toBe(false);
    });

    it("lowercases listing features before comparing", () => {
      expect(
        matches(
          { ...noFilters, mustHave: ["parking"] },
          { ...baseListing, features: ["PARKING", "Gym"] },
        ),
      ).toBe(true);
    });
  });
});

describe("SavedSearchInputSchema", () => {
  const baseInput = { name: "My search" };

  it("lowercases neighborhoods so the matcher receives canonical input", () => {
    const parsed = SavedSearchInputSchema.parse({ ...baseInput, neighborhoods: ["Kilimani", "WESTLANDS"] });
    expect(parsed.neighborhoods).toEqual(["kilimani", "westlands"]);
  });

  it("trims whitespace around neighborhood entries", () => {
    const parsed = SavedSearchInputSchema.parse({ ...baseInput, neighborhoods: ["  Kilimani  "] });
    expect(parsed.neighborhoods).toEqual(["kilimani"]);
  });

  it("lowercases mustHave features", () => {
    const parsed = SavedSearchInputSchema.parse({ ...baseInput, mustHave: ["Parking", "BALCONY"] });
    expect(parsed.mustHave).toEqual(["parking", "balcony"]);
  });

  it("defaults missing arrays to empty", () => {
    const parsed = SavedSearchInputSchema.parse(baseInput);
    expect(parsed.neighborhoods).toEqual([]);
    expect(parsed.mustHave).toEqual([]);
  });
});
