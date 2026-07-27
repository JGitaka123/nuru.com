/**
 * Market intelligence worker. Runs daily (cron from BullMQ) to compute
 * MarketStat rows: median rent + P25/P75 + days-to-rent + activity ratios
 * per (neighborhood, category, bedrooms) segment.
 *
 * Scheduling: enqueue once with `repeat: { pattern: "0 3 * * *" }` from a
 * boot script, or trigger manually. The job is idempotent via the unique
 * (observedDate, neighborhood, category, bedrooms) constraint.
 */

import { Worker as BullWorker } from "bullmq";
import { prisma } from "../db/client";
import { logger } from "../lib/logger";
import { countyForArea } from "../lib/locations";
import { redis, type MarketIntelJob } from "./queues";

type Scope = "NEIGHBORHOOD" | "COUNTY";

interface RawSegmentRow {
  scope: Scope;
  /** Area name for NEIGHBORHOOD scope; the county name for COUNTY scope. */
  neighborhood: string;
  county: string | null;
  category: string;
  bedrooms: number;
  rents: number[];          // KES cents, active listings
  daysToRent: number[];     // for listings rented in this segment
  activeCount: number;
  inquiriesCount: number;
  viewingsCount: number;
}

/** A segment needs at least this many active listings to publish a band. */
const MIN_SAMPLE = 3;

export function startMarketIntelWorker() {
  const worker = new BullWorker<MarketIntelJob>(
    "market-intel",
    async (job) => {
      const date = job.data.date ? new Date(job.data.date) : new Date();
      date.setUTCHours(0, 0, 0, 0);
      await runMarketIntel(date);
    },
    { connection: redis, concurrency: 1 },
  );
  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err }, "market-intel failed");
  });
  return worker;
}

/**
 * Compute and upsert every market segment for a date. Exported so backfills
 * and one-off recomputes can call it without going through the queue.
 */
export async function runMarketIntel(observedDate: Date) {
  logger.info({ observedDate }, "running market intel");

  // Step 1: pull all segment data via grouped raw SQL.
  // Active listings → for price bands.
  // Only RENT listings carry a meaningful monthly rent — sale asking prices
  // would badly skew the bands.
  const activeRows: Array<{
    neighborhood: string; county: string | null; category: string; bedrooms: number; rent_kes_cents: number;
  }> = await prisma.$queryRawUnsafe(`
    SELECT neighborhood, county, category::text AS category, bedrooms, "rentKesCents" AS rent_kes_cents
    FROM "Listing"
    WHERE status = 'ACTIVE' AND "fraudScore" < 60 AND "listingType" = 'RENT'
  `);

  // Recently-rented → for days-to-rent (last 90 days).
  const rentedRows: Array<{
    neighborhood: string; county: string | null; category: string; bedrooms: number; days_to_rent: number;
  }> = await prisma.$queryRawUnsafe(`
    SELECT neighborhood, county, category::text AS category, bedrooms,
           EXTRACT(DAY FROM ("rentedAt" - "publishedAt"))::int AS days_to_rent
    FROM "Listing"
    WHERE status = 'RENTED' AND "rentedAt" IS NOT NULL AND "publishedAt" IS NOT NULL
      AND "rentedAt" > NOW() - INTERVAL '90 days'
  `);

  // Counts of inquiries & viewings per segment (last 30 days).
  const activitySince = new Date(Date.now() - 30 * 86_400_000);
  const inquiryRows: Array<{ neighborhood: string; county: string | null; category: string; bedrooms: number; n: number }> =
    await prisma.$queryRawUnsafe(`
      SELECT l.neighborhood, l.county, l.category::text AS category, l.bedrooms, COUNT(*)::int AS n
      FROM "Inquiry" i JOIN "Listing" l ON l.id = i."listingId"
      WHERE i."createdAt" > $1
      GROUP BY l.neighborhood, l.county, l.category, l.bedrooms
    `, activitySince);

  const viewingRows: Array<{ neighborhood: string; county: string | null; category: string; bedrooms: number; n: number }> =
    await prisma.$queryRawUnsafe(`
      SELECT l.neighborhood, l.county, l.category::text AS category, l.bedrooms, COUNT(*)::int AS n
      FROM "Viewing" v JOIN "Listing" l ON l.id = v."listingId"
      WHERE v."createdAt" > $1
      GROUP BY l.neighborhood, l.county, l.category, l.bedrooms
    `, activitySince);

  // Step 2: bucket into segments. Every listing feeds two segments — its own
  // neighborhood and its county — so thin local markets still roll up into a
  // usable county-level band.
  const segments = new Map<string, RawSegmentRow>();
  const seg = (scope: Scope, label: string, county: string | null, c: string, b: number) => {
    const k = `${scope}|${label}|${c}|${b}`;
    let s = segments.get(k);
    if (!s) {
      s = { scope, neighborhood: label, county, category: c, bedrooms: b,
            rents: [], daysToRent: [], activeCount: 0,
            inquiriesCount: 0, viewingsCount: 0 };
      segments.set(k, s);
    }
    return s;
  };

  /** The (up to two) segments a row belongs to: its neighborhood and its county. */
  const targets = (r: { neighborhood: string; county: string | null; category: string; bedrooms: number }) => {
    const county = r.county ?? countyForArea(r.neighborhood);
    const list = [seg("NEIGHBORHOOD", r.neighborhood, county, r.category, r.bedrooms)];
    // The two scopes are stored and queried independently, so a listing whose
    // area name happens to equal its county still belongs in the county band.
    if (county) list.push(seg("COUNTY", county, county, r.category, r.bedrooms));
    return list;
  };

  for (const r of activeRows) {
    for (const s of targets(r)) { s.rents.push(r.rent_kes_cents); s.activeCount++; }
  }
  for (const r of rentedRows) {
    for (const s of targets(r)) s.daysToRent.push(r.days_to_rent);
  }
  for (const r of inquiryRows) {
    for (const s of targets(r)) s.inquiriesCount += r.n;
  }
  for (const r of viewingRows) {
    for (const s of targets(r)) s.viewingsCount += r.n;
  }

  // Step 3: compute stats and upsert.
  let upserts = 0;
  for (const s of segments.values()) {
    if (s.rents.length < MIN_SAMPLE) continue;   // skip thin segments
    const sortedRents = [...s.rents].sort((a, b) => a - b);
    const sortedDays = [...s.daysToRent].sort((a, b) => a - b);

    const median = pct(sortedRents, 0.5);
    const p25 = pct(sortedRents, 0.25);
    const p75 = pct(sortedRents, 0.75);
    const daysMedian = sortedDays.length > 0 ? pct(sortedDays, 0.5) : null;
    const inquiriesPerActive = s.activeCount > 0 ? s.inquiriesCount / s.activeCount : 0;
    const viewingsPerActive = s.activeCount > 0 ? s.viewingsCount / s.activeCount : 0;

    await prisma.marketStat.upsert({
      where: {
        observedDate_scope_neighborhood_category_bedrooms: {
          observedDate,
          scope: s.scope,
          neighborhood: s.neighborhood,
          category: s.category as never,
          bedrooms: s.bedrooms,
        },
      },
      create: {
        observedDate,
        scope: s.scope,
        neighborhood: s.neighborhood,
        county: s.county,
        category: s.category as never,
        bedrooms: s.bedrooms,
        rentMedian: Math.round(median),
        rentP25: Math.round(p25),
        rentP75: Math.round(p75),
        sampleSize: s.rents.length,
        daysToRentMedian: daysMedian !== null ? Math.round(daysMedian) : null,
        inquiriesPerActive,
        viewingsPerActive,
      },
      update: {
        county: s.county,
        rentMedian: Math.round(median),
        rentP25: Math.round(p25),
        rentP75: Math.round(p75),
        sampleSize: s.rents.length,
        daysToRentMedian: daysMedian !== null ? Math.round(daysMedian) : null,
        inquiriesPerActive,
        viewingsPerActive,
      },
    });
    upserts++;
  }
  logger.info({ observedDate, segments: upserts }, "market intel done");
}

function pct(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}
