/**
 * Wrappers for self-hosted inference services.
 *
 * Architecture: a single GPU instance (L4 or A10) running three FastAPI
 * servers via Hugging Face Text Embeddings Inference (TEI) and faster-whisper.
 * See infra/inference/docker-compose.yml.
 *
 * Why self-hosted: high-volume, low-margin tasks. At 1M searches/month,
 * embeddings via OpenAI/Voyage would cost ~$500/mo; self-hosted on a single
 * L4 is ~$200/mo flat regardless of volume.
 */

import axios from "axios";
import { logger } from "../lib/logger";

const EMBEDDING_URL = process.env.EMBEDDING_URL ?? "http://localhost:8001";
const RERANKER_URL = process.env.RERANKER_URL ?? "http://localhost:8002";
const WHISPER_URL = process.env.WHISPER_URL ?? "http://localhost:8003";

/**
 * Embed text with bge-m3 (1024-dim, multilingual, includes Swahili).
 * Returns a normalized float vector.
 */
export async function embed(text: string): Promise<number[]> {
  const { data } = await axios.post<{ embedding: number[] }>(
    `${EMBEDDING_URL}/embed`,
    { input: text },
    { timeout: 5_000 }
  );
  return data.embedding;
}

/** Batch embed — used for listing creation and nightly backfills. */
export async function embedBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const { data } = await axios.post<{ embeddings: number[][] }>(
    `${EMBEDDING_URL}/embed_batch`,
    { input: texts },
    { timeout: 30_000 }
  );
  return data.embeddings;
}

/**
 * Rerank candidates against a query. Returns indices sorted by relevance,
 * truncated to topK.
 */
export async function rerank(p: {
  query: string;
  docs: string[];
  topK: number;
}): Promise<Array<{ index: number; score: number }>> {
  const { data } = await axios.post<{
    results: Array<{ index: number; score: number }>;
  }>(
    `${RERANKER_URL}/rerank`,
    { query: p.query, documents: p.docs, top_k: p.topK },
    { timeout: 5_000 }
  );
  return data.results;
}

/**
 * Transcribe a voice note. Used when tenants record their search query.
 * faster-whisper-large-v3 handles English, Swahili, and reasonably handles
 * Sheng code-switching.
 */
export async function transcribe(p: {
  audioUrl: string;
  language?: "en" | "sw" | "auto";
}): Promise<{ text: string; detectedLanguage: string }> {
  const { data } = await axios.post<{ text: string; language: string }>(
    `${WHISPER_URL}/transcribe`,
    { url: p.audioUrl, language: p.language ?? "auto" },
    { timeout: 60_000 }
  );
  return { text: data.text, detectedLanguage: data.language };
}

/** Health checks — call from /health endpoint. */
export async function inferenceHealth() {
  const checks = await Promise.allSettled([
    axios.get(`${EMBEDDING_URL}/health`, { timeout: 2_000 }),
    axios.get(`${RERANKER_URL}/health`, { timeout: 2_000 }),
    axios.get(`${WHISPER_URL}/health`, { timeout: 2_000 }),
  ]);
  return {
    embedding: checks[0].status === "fulfilled",
    reranker: checks[1].status === "fulfilled",
    whisper: checks[2].status === "fulfilled",
  };
}
