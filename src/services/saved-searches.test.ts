import { describe, it, expect } from "vitest";
import { matches } from "./saved-searches";

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
    it("matches when neighborhood is in the saved-search list", () => {
      expect(matches({ ...noFilters, neighborhoods: ["Kilimani", "Westlands"] }, baseListing)).toBe(true);
    });

    it("rejects when neighborhood is not in the saved-search list", () => {
      expect(matches({ ...noFilters, neighborhoods: ["Lavington"] }, baseListing)).toBe(false);
    });

    it("matches case-insensitively (saved as lowercase, listing capitalized)", () => {
      expect(matches({ ...noFilters, neighborhoods: ["kilimani"] }, baseListing)).toBe(true);
    });

    it("matches case-insensitively (saved capitalized, listing lowercase)", () => {
      expect(matches({ ...noFilters, neighborhoods: ["Kilimani"] }, { ...baseListing, neighborhood: "kilimani" })).toBe(true);
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
      expect(matches({ ...noFilters, mustHave: ["Parking", "Balcony"] }, baseListing)).toBe(true);
    });

    it("rejects when listing is missing a required feature", () => {
      expect(matches({ ...noFilters, mustHave: ["Parking", "Pool"] }, baseListing)).toBe(false);
    });

    it("matches case-insensitively (saved as lowercase, listing capitalized)", () => {
      expect(matches({ ...noFilters, mustHave: ["parking", "balcony"] }, baseListing)).toBe(true);
    });

    it("matches case-insensitively (saved capitalized, listing lowercase)", () => {
      expect(
        matches(
          { ...noFilters, mustHave: ["Parking"] },
          { ...baseListing, features: ["parking", "gym"] },
        ),
      ).toBe(true);
    });
  });
});
