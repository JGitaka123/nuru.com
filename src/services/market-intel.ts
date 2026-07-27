/**
 * Market intelligence queries.
 *
 * Reads from MarketStat (computed daily by src/workers/market-intel.ts).
 * Used by:
 *   - Agent listing creator → "Listings like this rent for KES X-Y"
 *   - Tenant listing detail → "Y% below/above market"
 *   - Fraud scorer → rentVsMarketMedianRatio signal
 */

import type { ListingCategory } from "@prisma/client";
import { prisma } from "../db/client";
import { countyForArea } from "../lib/locations";

export interface PriceBand {
  median: number;        // KES cents
  p25: number;
  p75: number;
  sampleSize: number;
  observedDate: Date;
  /** Which segment this band came from — neighborhood is more precise. */
  scope: "NEIGHBORHOOD" | "COUNTY";
  /** The segment label the band describes (area name, or county name). */
  area: string;
}

/**
 * Most recent price band for a segment.
 *
 * Falls back from the precise neighborhood band to the county band, so small
 * up-country markets — where a single estate rarely has enough active supply
 * to form its own band — still get a usable price signal.
 */
export async function priceBandFor(opts: {
  neighborhood: string;
  county?: string | null;
  category: ListingCategory;
  bedrooms: number;
}): Promise<PriceBand | null> {
  const common = { category: opts.category, bedrooms: opts.bedrooms };

  const local = await prisma.marketStat.findFirst({
    where: { ...common, scope: "NEIGHBORHOOD", neighborhood: opts.neighborhood },
    orderBy: { observedDate: "desc" },
  });
  if (local) return toBand(local);

  const county = opts.county ?? countyForArea(opts.neighborhood);
  if (!county) return null;
  const wide = await prisma.marketStat.findFirst({
    where: { ...common, scope: "COUNTY", neighborhood: county },
    orderBy: { observedDate: "desc" },
  });
  return wide ? toBand(wide) : null;
}

type StatRow = {
  rentMedian: number; rentP25: number; rentP75: number;
  sampleSize: number; observedDate: Date; scope: string; neighborhood: string;
};

function toBand(stat: StatRow): PriceBand {
  return {
    median: stat.rentMedian,
    p25: stat.rentP25,
    p75: stat.rentP75,
    sampleSize: stat.sampleSize,
    observedDate: stat.observedDate,
    scope: stat.scope === "COUNTY" ? "COUNTY" : "NEIGHBORHOOD",
    area: stat.neighborhood,
  };
}

/** Where does a given rent fall relative to the market band? */
export async function priceComparison(opts: {
  neighborhood: string;
  county?: string | null;
  category: ListingCategory;
  bedrooms: number;
  rentKesCents: number;
}): Promise<
  | { hasBand: false }
  | {
      hasBand: true;
      band: PriceBand;
      ratio: number;        // rent / median
      label: "below" | "at" | "above";
      percentDiff: number;  // signed % difference from median
    }
> {
  const band = await priceBandFor(opts);
  if (!band) return { hasBand: false };
  const ratio = opts.rentKesCents / band.median;
  const percentDiff = ((opts.rentKesCents - band.median) / band.median) * 100;
  const label = ratio < 0.9 ? "below" : ratio > 1.1 ? "above" : "at";
  return { hasBand: true, band, ratio, label, percentDiff };
}

/** Aggregated stats across all neighborhoods for the admin dashboard. */
export async function marketSnapshot(date: Date = new Date()) {
  const observedDate = new Date(date);
  observedDate.setUTCHours(0, 0, 0, 0);
  return prisma.marketStat.findMany({
    where: { observedDate },
    orderBy: [{ neighborhood: "asc" }, { category: "asc" }, { bedrooms: "asc" }],
  });
}
