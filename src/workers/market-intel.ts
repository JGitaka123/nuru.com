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
import { redis, type MarketIntelJob } from "./queues";

interface RawSegmentRow {
  neighborhood: string;
  category: string;
  bedrooms: number;
  rents: number[];          // KES cents, active listings
  daysToRent: number[];     // for listings rented in this segment
  activeCount: number;
  inquiriesCount: number;
  viewingsCount: number;
}

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

async function runMarketIntel(observedDate: Date) {
  logger.info({ observedDate }, "running market intel");

  // Step 1: pull all segment data via grouped raw SQL.
  // Active listings → for price bands.
  const activeRows: Array<{
    neighborhood: string; category: string; bedrooms: number; rent_kes_cents: number;
  }> = await prisma.$queryRawUnsafe(`
    SELECT neighborhood, category::text AS category, bedrooms, rent_kes_cents
    FROM "Listing"
    WHERE status = 'ACTIVE' AND fraud_score < 60
  `);

  // Recently-rented → for days-to-rent (last 90 days).
  const rentedRows: Array<{
    neighborhood: string; category: string; bedrooms: number; days_to_rent: number;
  }> = await prisma.$queryRawUnsafe(`
    SELECT neighborhood, category::text AS category, bedrooms,
           EXTRACT(DAY FROM (rented_at - published_at))::int AS days_to_rent
    FROM "Listing"
    WHERE status = 'RENTED' AND rented_at IS NOT NULL AND published_at IS NOT NULL
      AND rented_at > NOW() - INTERVAL '90 days'
  `);

  // Counts of inquiries & viewings per segment (last 30 days).
  const activitySince = new Date(Date.now() - 30 * 86_400_000);
  const inquiryRows: Array<{ neighborhood: string; category: string; bedrooms: number; n: number }> =
    await prisma.$queryRawUnsafe(`
      SELECT l.neighborhood, l.category::text AS category, l.bedrooms, COUNT(*)::int AS n
      FROM "Inquiry" i JOIN "Listing" l ON l.id = i.listing_id
      WHERE i.created_at > $1
      GROUP BY l.neighborhood, l.category, l.bedrooms
    `, activitySince);

  const viewingRows: Array<{ neighborhood: string; category: string; bedrooms: number; n: number }> =
    await prisma.$queryRawUnsafe(`
      SELECT l.neighborhood, l.category::text AS category, l.bedrooms, COUNT(*)::int AS n
      FROM "Viewing" v JOIN "Listing" l ON l.id = v.listing_id
      WHERE v.created_at > $1
      GROUP BY l.neighborhood, l.category, l.bedrooms
    `, activitySince);

  // Step 2: bucket into segments.
  const segments = new Map<string, RawSegmentRow>();
  const key = (n: string, c: string, b: number) => `${n}|${c}|${b}`;
  const seg = (n: string, c: string, b: number) => {
    const k = key(n, c, b);
    let s = segments.get(k);
    if (!s) {
      s = { neighborhood: n, category: c, bedrooms: b,
            rents: [], daysToRent: [], activeCount: 0,
            inquiriesCount: 0, viewingsCount: 0 };
      segments.set(k, s);
    }
    return s;
  };

  for (const r of activeRows) {
    const s = seg(r.neighborhood, r.category, r.bedrooms);
    s.rents.push(r.rent_kes_cents); s.activeCount++;
  }
  for (const r of rentedRows) {
    const s = seg(r.neighborhood, r.category, r.bedrooms);
    s.daysToRent.push(r.days_to_rent);
  }
  for (const r of inquiryRows) {
    const s = seg(r.neighborhood, r.category, r.bedrooms);
    s.inquiriesCount += r.n;
  }
  for (const r of viewingRows) {
    const s = seg(r.neighborhood, r.category, r.bedrooms);
    s.viewingsCount += r.n;
  }

  // Step 3: compute stats and upsert.
  let upserts = 0;
  for (const s of segments.values()) {
    if (s.rents.length < 3) continue;        // skip thin segments
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
        observedDate_neighborhood_category_bedrooms: {
          observedDate,
          neighborhood: s.neighborhood,
          category: s.category as never,
          bedrooms: s.bedrooms,
        },
      },
      create: {
        observedDate,
        neighborhood: s.neighborhood,
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
