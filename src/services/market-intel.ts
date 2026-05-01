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

export interface PriceBand {
  median: number;        // KES cents
  p25: number;
  p75: number;
  sampleSize: number;
  observedDate: Date;
}

/** Fetch the most recent price band for a (neighborhood, category, bedrooms). */
export async function priceBandFor(opts: {
  neighborhood: string;
  category: ListingCategory;
  bedrooms: number;
}): Promise<PriceBand | null> {
  const stat = await prisma.marketStat.findFirst({
    where: {
      neighborhood: opts.neighborhood,
      category: opts.category,
      bedrooms: opts.bedrooms,
    },
    orderBy: { observedDate: "desc" },
  });
  if (!stat) return null;
  return {
    median: stat.rentMedian,
    p25: stat.rentP25,
    p75: stat.rentP75,
    sampleSize: stat.sampleSize,
    observedDate: stat.observedDate,
  };
}

/** Where does a given rent fall relative to the market band? */
export async function priceComparison(opts: {
  neighborhood: string;
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
