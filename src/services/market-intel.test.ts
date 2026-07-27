import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  marketStat: { findFirst: vi.fn() },
}));

vi.mock("../db/client", () => ({ prisma: prismaMock }));

import { priceBandFor, priceComparison } from "./market-intel";

const OBSERVED = new Date("2026-07-26T00:00:00.000Z");

function stat(over: Partial<Record<string, unknown>> = {}) {
  return {
    rentMedian: 5_000_000,   // 50,000 KES
    rentP25: 4_000_000,
    rentP75: 6_500_000,
    sampleSize: 8,
    observedDate: OBSERVED,
    scope: "NEIGHBORHOOD",
    neighborhood: "Kilimani",
    ...over,
  };
}

describe("priceBandFor — neighborhood → county fallback", () => {
  beforeEach(() => vi.clearAllMocks());

  it("prefers the precise neighborhood band when one exists", async () => {
    prismaMock.marketStat.findFirst.mockResolvedValueOnce(stat());

    const band = await priceBandFor({ neighborhood: "Kilimani", category: "TWO_BR" as never, bedrooms: 2 });

    expect(band?.scope).toBe("NEIGHBORHOOD");
    expect(band?.area).toBe("Kilimani");
    expect(band?.median).toBe(5_000_000);
    // Only one query — no pointless county lookup once we have a local band.
    expect(prismaMock.marketStat.findFirst).toHaveBeenCalledTimes(1);
  });

  it("falls back to the county band when the area has none", async () => {
    prismaMock.marketStat.findFirst
      .mockResolvedValueOnce(null)                                             // no neighborhood band
      .mockResolvedValueOnce(stat({ scope: "COUNTY", neighborhood: "Uasin Gishu", rentMedian: 3_000_000 }));

    // Kapsoya is an Eldoret/Uasin Gishu area — thin supply, so it rolls up.
    const band = await priceBandFor({ neighborhood: "Kapsoya", category: "TWO_BR" as never, bedrooms: 2 });

    expect(band?.scope).toBe("COUNTY");
    expect(band?.area).toBe("Uasin Gishu");
    expect(band?.median).toBe(3_000_000);
    // Second query must target the COUNTY scope of the derived county.
    expect(prismaMock.marketStat.findFirst).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ scope: "COUNTY", neighborhood: "Uasin Gishu" }),
      }),
    );
  });

  it("uses an explicit county over deriving one from the area name", async () => {
    prismaMock.marketStat.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(stat({ scope: "COUNTY", neighborhood: "Kisumu" }));

    // "Milimani" exists in several counties, so the caller's county wins.
    await priceBandFor({ neighborhood: "Milimani", county: "Kisumu", category: "TWO_BR" as never, bedrooms: 2 });

    expect(prismaMock.marketStat.findFirst).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ scope: "COUNTY", neighborhood: "Kisumu" }),
      }),
    );
  });

  it("returns null when neither scope has data and the county is unknown", async () => {
    prismaMock.marketStat.findFirst.mockResolvedValue(null);

    const band = await priceBandFor({ neighborhood: "Nowhere-ville", category: "TWO_BR" as never, bedrooms: 2 });

    expect(band).toBeNull();
  });
});

describe("priceComparison", () => {
  beforeEach(() => vi.clearAllMocks());

  it("labels a materially cheaper rent as below market", async () => {
    prismaMock.marketStat.findFirst.mockResolvedValueOnce(stat());

    const cmp = await priceComparison({
      neighborhood: "Kilimani", category: "TWO_BR" as never, bedrooms: 2,
      rentKesCents: 4_000_000,   // 40K vs 50K median
    });

    expect(cmp.hasBand).toBe(true);
    if (!cmp.hasBand) throw new Error("expected a band");
    expect(cmp.label).toBe("below");
    expect(cmp.ratio).toBeCloseTo(0.8);
    expect(Math.round(cmp.percentDiff)).toBe(-20);
  });

  it("treats a rent within ±10% of median as at market", async () => {
    prismaMock.marketStat.findFirst.mockResolvedValueOnce(stat());

    const cmp = await priceComparison({
      neighborhood: "Kilimani", category: "TWO_BR" as never, bedrooms: 2,
      rentKesCents: 5_200_000,
    });

    if (!cmp.hasBand) throw new Error("expected a band");
    expect(cmp.label).toBe("at");
  });

  it("reports no band rather than guessing when the segment is empty", async () => {
    prismaMock.marketStat.findFirst.mockResolvedValue(null);

    const cmp = await priceComparison({
      neighborhood: "Nowhere-ville", category: "TWO_BR" as never, bedrooms: 2, rentKesCents: 5_000_000,
    });

    expect(cmp.hasBand).toBe(false);
  });
});
