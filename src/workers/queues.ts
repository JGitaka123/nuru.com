/**
 * BullMQ queue declarations. Both producers (API) and consumers (workers)
 * import from here so queue names stay in sync.
 */

import { Queue } from "bullmq";
import IORedis from "ioredis";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

// Single connection shared across queues. BullMQ creates worker-specific
// connections internally for blocking ops.
export const redis = new IORedis(REDIS_URL, {
  maxRetriesPerRequest: null,
});

const baseOpts = { connection: redis };

export interface ListingEnrichmentJob {
  listingId: string;
}
export const listingEnrichmentQueue = new Queue<ListingEnrichmentJob>("listing-enrichment", baseOpts);

export interface EscrowReleaseJob {
  escrowId: string;
}
export const escrowReleaseQueue = new Queue<EscrowReleaseJob>("escrow-release", baseOpts);

export interface ViewingReminderJob {
  viewingId: string;
  channel: "sms" | "whatsapp";
}
export const viewingReminderQueue = new Queue<ViewingReminderJob>("viewing-reminders", baseOpts);

export interface FraudRescoreJob {
  /** If null, rescore everything that hasn't been rescored in 24h. */
  listingId: string | null;
}
export const fraudRescoreQueue = new Queue<FraudRescoreJob>("fraud-rescore", baseOpts);
