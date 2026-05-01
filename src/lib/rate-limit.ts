/**
 * Lightweight in-memory rate limiter, keyed by string (typically phone or IP).
 *
 * In-process only — fine for single-node MVP. Swap for Redis when we go
 * multi-node (BullMQ already brings ioredis as a transitive dep).
 */

import { RateLimitError } from "./errors";

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

/**
 * Throws RateLimitError if `key` exceeded `max` calls in `windowMs`.
 * Otherwise increments the bucket and returns.
 */
export function consume(key: string, max: number, windowMs: number): void {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  if (b.count >= max) {
    const retryAfterSec = Math.ceil((b.resetAt - now) / 1000);
    throw new RateLimitError(`Rate limit exceeded. Try again in ${retryAfterSec}s.`);
  }
  b.count++;
}

/** Test/admin helper: reset a key. */
export function reset(key: string): void {
  buckets.delete(key);
}

/** Periodic cleanup of expired buckets. */
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(k);
  }
}, 60_000).unref();
