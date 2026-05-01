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

// ML / analytics queues.
export interface EventJob {
  type: string;
  actorId: string | null;
  actorRole: string | null;
  targetType: string | null;
  targetId: string | null;
  properties: Record<string, unknown> | undefined;
  variantKey: string | null;
  sessionId: string | null;
  ipHash: string | null;
  userAgent: string | null;
}
export const eventQueue = new Queue<EventJob>("events", baseOpts);

export interface MarketIntelJob {
  /** YYYY-MM-DD; defaults to today UTC. */
  date?: string;
}
export const marketIntelQueue = new Queue<MarketIntelJob>("market-intel", baseOpts);

export interface OutreachSendJob {
  /** Drain QUEUED emails for this campaign (or all if null). */
  campaignId: string | null;
}
export const outreachSendQueue = new Queue<OutreachSendJob>("outreach-send", baseOpts);

export interface SearchAlertJob {
  /** Listing that just published — match against active SavedSearches. */
  listingId: string;
}
export const searchAlertQueue = new Queue<SearchAlertJob>("search-alerts", baseOpts);

// Subscription billing — daily charge runner.
export interface BillingJob { tick?: number }
export const billingQueue = new Queue<BillingJob>("billing", baseOpts);

// Autonomous CRM — scanner + executor.
export interface AgentTasksJob { mode: "scan" | "execute"; taskId?: string }
export const agentTasksQueue = new Queue<AgentTasksJob>("agent-tasks", baseOpts);
