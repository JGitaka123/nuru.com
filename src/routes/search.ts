/**
 * GET /v1/search?q=<natural language>
 *
 * Pipeline:
 *   1. Parse query → structured filters + semantic intent  (Haiku)
 *   2. Build SQL with filters + PostGIS geo  (Postgres)
 *   3. Embed semantic intent  (self-hosted bge-m3)
 *   4. Vector similarity over candidates  (pgvector)
 *   5. Rerank top 50 → 20  (self-hosted bge-reranker)
 *   6. Return with the parsed filters so the UI can show chips
 *
 * Cost per search: ~$0.0008 Claude + ~$0 embedding/rerank (self-hosted).
 * At 1M searches/year: ~$800.
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db/client";
import { parseSearchQuery, heuristicParseSearchQuery } from "../prompts/search-parser";
import { embed, rerank } from "../services/inference";
import { recordEvent } from "../services/events";
import { logger } from "../lib/logger";

const QuerySchema = z.object({
  q: z.string().min(1).max(500),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export async function searchRoutes(app: FastifyInstance) {
  app.get("/v1/search", async (req, reply) => {
    const { q, limit } = QuerySchema.parse(req.query);

    // Step 1: parse natural language → structured filters.
    // If Claude is unreachable, degrade to the deterministic parser —
    // a keyword search beats a 500.
    let degraded = false;
    const f = await parseSearchQuery(q).then(
      (r) => r.content,
      (err) => {
        logger.warn({ err }, "search parser unavailable — heuristic fallback");
        degraded = true;
        return heuristicParseSearchQuery(q);
      },
    );

    // Step 2: SQL filter pass — narrow to plausible candidates.
    // Using Prisma's raw SQL for pgvector — we'll add the geo + vector
    // similarity in a single query for efficiency.
    const filterClauses: string[] = ["status = 'ACTIVE'", '"fraudScore" < 60'];
    const params: any[] = [];
    let p = 1;

    if (f.neighborhoods.length) {
      filterClauses.push(`neighborhood = ANY($${p}::text[])`);
      params.push(f.neighborhoods);
      p++;
    }
    if (f.bedroomsMin !== null) {
      filterClauses.push(`bedrooms >= $${p}`);
      params.push(f.bedroomsMin);
      p++;
    }
    if (f.bedroomsMax !== null) {
      filterClauses.push(`bedrooms <= $${p}`);
      params.push(f.bedroomsMax);
      p++;
    }
    if (f.rentMaxKes !== null) {
      filterClauses.push(`"rentKesCents" <= $${p}`);
      params.push(f.rentMaxKes * 100);
      p++;
    }
    if (f.rentMinKes !== null) {
      filterClauses.push(`"rentKesCents" >= $${p}`);
      params.push(f.rentMinKes * 100);
      p++;
    }
    for (const feat of f.mustHave) {
      filterClauses.push(`$${p} = ANY(features)`);
      params.push(feat);
      p++;
    }

    // Step 3: embed semantic intent. If the inference box is down, fall
    // back to filter-only SQL ordered by recency.
    const queryVec = await embed(f.semanticQuery || q).catch((err: unknown) => {
      logger.warn({ err }, "embedding service unavailable — filter-only search");
      degraded = true;
      return null;
    });

    type CandidateRow = {
      id: string;
      title: string;
      neighborhood: string;
      rent_kes_cents: number;
      bedrooms: number;
      primary_photo_key: string | null;
      description: string;
      score: number;
    };

    // Step 4: vector similarity over filtered candidates (cosine distance,
    // limit 50 for the reranker pass) — or recency order in degraded mode.
    // Degraded mode also drops the embedding IS NOT NULL clause: enrichment
    // may not have run yet either, and unranked results beat none.
    let candidates: CandidateRow[];
    if (queryVec) {
      params.push(`[${queryVec.join(",")}]`);
      const vecParam = `$${p}`;
      p++;
      params.push(50);
      candidates = await prisma.$queryRawUnsafe(
        `
        SELECT id, title, neighborhood, "rentKesCents" AS rent_kes_cents, bedrooms,
               "primaryPhotoKey" AS primary_photo_key, description,
               1 - (embedding <=> ${vecParam}::vector) AS score
        FROM "Listing"
        WHERE ${filterClauses.join(" AND ")}
          AND embedding IS NOT NULL
        ORDER BY embedding <=> ${vecParam}::vector
        LIMIT $${p}
        `,
        ...params
      );
    } else {
      params.push(limit);
      candidates = await prisma.$queryRawUnsafe(
        `
        SELECT id, title, neighborhood, "rentKesCents" AS rent_kes_cents, bedrooms,
               "primaryPhotoKey" AS primary_photo_key, description,
               0::float8 AS score
        FROM "Listing"
        WHERE ${filterClauses.join(" AND ")}
        ORDER BY "publishedAt" DESC NULLS LAST
        LIMIT $${p}
        `,
        ...params
      );
    }

    if (candidates.length === 0) {
      return reply.send({
        filters: f,
        clarifyingQuestion: f.clarifyingQuestion,
        results: [],
        degraded,
        suggestion: f.neighborhoods.length
          ? "No matches in those neighborhoods. Try expanding your area or budget."
          : null,
      });
    }

    // Step 5: rerank — fewer false positives at the top. If the reranker
    // is down, keep the existing (vector or recency) order.
    const ranked = await rerank({
      query: f.semanticQuery || q,
      docs: candidates.map((c) => `${c.title}. ${c.description}`),
      topK: limit,
    }).catch((err: unknown) => {
      logger.warn({ err }, "reranker unavailable — keeping candidate order");
      degraded = true;
      return candidates.slice(0, limit).map((c, index) => ({ index, score: c.score }));
    });

    const results = ranked.map((r) => ({
      ...candidates[r.index],
      relevance: r.score,
    }));

    recordEvent({
      type: "search",
      actorId: req.user?.sub ?? null,
      actorRole: req.user?.role ?? null,
      targetType: "search",
      targetId: null,
      properties: {
        q,
        language: f.detectedLanguage,
        neighborhoods: f.neighborhoods,
        rentMaxKes: f.rentMaxKes,
        bedroomsMin: f.bedroomsMin,
        mustHave: f.mustHave,
        resultCount: results.length,
      },
      ip: req.ip,
      userAgent: req.headers["user-agent"] ?? null,
    });

    return reply.send({
      filters: f,
      clarifyingQuestion: f.clarifyingQuestion,
      results,
      degraded,
    });
  });
}
