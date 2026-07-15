import { describe, it, expect } from "vitest";
import {
  KENYA_COUNTIES, canonicalCounty, countyForArea, isKnownCounty,
  allSearchablePlaces, ALL_COUNTY_NAMES,
} from "./locations";

describe("Kenya location registry", () => {
  it("covers all 47 counties", () => {
    expect(KENYA_COUNTIES).toHaveLength(47);
    expect(new Set(ALL_COUNTY_NAMES).size).toBe(47);
  });

  it("recognises county names case-insensitively", () => {
    expect(isKnownCounty("nairobi")).toBe(true);
    expect(isKnownCounty("MOMBASA")).toBe(true);
    expect(canonicalCounty("kisumu")).toBe("Kisumu");
    expect(isKnownCounty("Atlantis")).toBe(false);
  });

  it("derives a county from an area", () => {
    expect(countyForArea("Nyali")).toBe("Mombasa");
    expect(countyForArea("Elgon View")).toBe("Uasin Gishu");
    expect(countyForArea("Kilimani")).toBe("Nairobi");
    expect(countyForArea("Thika")).toBe("Kiambu");
  });

  it("falls back to treating the input as a county", () => {
    expect(countyForArea("Nakuru")).toBe("Nakuru");
  });

  it("returns null for unknown areas", () => {
    expect(countyForArea("Nowhere-ville")).toBeNull();
  });

  it("lists searchable places including counties and areas", () => {
    const places = allSearchablePlaces();
    expect(places).toContain("Nairobi");
    expect(places).toContain("Nyali");
    expect(places).toContain("Eldoret CBD");
    // De-duplicated.
    expect(new Set(places).size).toBe(places.length);
  });
});
