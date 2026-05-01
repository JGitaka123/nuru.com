/**
 * Listing recommendations.
 *
 * Powered by the existing `embedding` column on Listing (1024-dim bge-m3).
 * No model training needed — semantic similarity over the embedding space.
 *
 * Two flavors:
 *   - similarListings(id, k): nearest neighbors of a specific listing
 *   - recommendedForUser(userId, k): centroid of a user's recent
 *     interactions → nearest listings
 */

import { prisma } from "../db/client";
import { logger } from "../lib/logger";

interface ResultRow {
  id: string;
  title: string;
  neighborhood: string;
  rent_kes_cents: number;
  bedrooms: number;
  primary_photo_key: string | null;
  score: number;
}

/**
 * Find listings semantically similar to the given one. Excludes the source
 * listing, requires ACTIVE status and fraudScore < 60.
 */
export async function similarListings(listingId: string, k = 6): Promise<ResultRow[]> {
  const limit = Math.max(1, Math.min(k, 20));
  const rows: ResultRow[] = await prisma.$queryRawUnsafe(
    `
    SELECT l.id, l.title, l.neighborhood, l.rent_kes_cents, l.bedrooms,
           l.primary_photo_key,
           1 - (l.embedding <=> source.embedding) AS score
    FROM "Listing" l, (SELECT embedding FROM "Listing" WHERE id = $1) AS source
    WHERE l.id != $1
      AND l.status = 'ACTIVE'
      AND l.fraud_score < 60
      AND l.embedding IS NOT NULL
      AND source.embedding IS NOT NULL
    ORDER BY l.embedding <=> source.embedding
    LIMIT $2
    `,
    listingId,
    limit,
  );
  return rows;
}

/**
 * Personalized: average the embeddings of listings the user has interacted
 * with (viewed, inquired, applied, saved) and find the nearest matches.
 *
 * Cold-start (no history): returns the highest-quality recent listings.
 */
export async function recommendedForUser(userId: string, k = 12): Promise<ResultRow[]> {
  const limit = Math.max(1, Math.min(k, 24));

  // Pull recent interaction targets — viewed via Event, plus inquiry/apply/saved.
  const [events, inquiries, applications, saved] = await Promise.all([
    prisma.event.findMany({
      where: {
        actorId: userId,
        type: { in: ["listing_view", "search_click"] },
        targetType: "listing",
        createdAt: { gte: new Date(Date.now() - 30 * 86_400_000) },
      },
      select: { targetId: true },
      take: 50,
    }),
    prisma.inquiry.findMany({ where: { tenantId: userId }, select: { listingId: true }, take: 20 }),
    prisma.application.findMany({ where: { tenantId: userId }, select: { listingId: true }, take: 20 }),
    prisma.savedListing.findMany({ where: { userId }, select: { listingId: true }, take: 30 }),
  ]);

  const ids = new Set<string>();
  for (const e of events) if (e.targetId) ids.add(e.targetId);
  for (const i of inquiries) ids.add(i.listingId);
  for (const a of applications) ids.add(a.listingId);
  for (const s of saved) ids.add(s.listingId);

  if (ids.size === 0) return coldStart(limit);

  // Average the embeddings via a single SQL pass.
  try {
    const rows: ResultRow[] = await prisma.$queryRawUnsafe(
      `
      WITH centroid AS (
        SELECT AVG(embedding)::vector(1024) AS v
        FROM "Listing"
        WHERE id = ANY($1::text[]) AND embedding IS NOT NULL
      )
      SELECT l.id, l.title, l.neighborhood, l.rent_kes_cents, l.bedrooms,
             l.primary_photo_key,
             1 - (l.embedding <=> c.v) AS score
      FROM "Listing" l, centroid c
      WHERE l.id != ALL($1::text[])
        AND l.status = 'ACTIVE'
        AND l.fraud_score < 60
        AND l.embedding IS NOT NULL
        AND c.v IS NOT NULL
      ORDER BY l.embedding <=> c.v
      LIMIT $2
      `,
      Array.from(ids),
      limit,
    );
    if (rows.length > 0) return rows;
  } catch (err) {
    logger.warn({ err }, "recommendedForUser query failed; falling back to cold start");
  }
  return coldStart(limit);
}

async function coldStart(k: number): Promise<ResultRow[]> {
  // Highest AI quality score among recently-published, no fraud.
  return prisma.$queryRawUnsafe<ResultRow[]>(
    `
    SELECT id, title, neighborhood, rent_kes_cents, bedrooms,
           primary_photo_key, COALESCE(ai_quality_score, 0.5) AS score
    FROM "Listing"
    WHERE status = 'ACTIVE'
      AND fraud_score < 60
      AND published_at > NOW() - INTERVAL '30 days'
    ORDER BY published_at DESC
    LIMIT $1
    `,
    k,
  );
}
