/**
 * Event capture — analytics + ML training data.
 *
 * Fire-and-forget: every callsite uses `recordEvent({...})` which enqueues
 * to BullMQ. The worker (src/workers/event-processor.ts) batches inserts.
 *
 * Critical events for the funnel: search, search_click, listing_view,
 * inquiry_submit, viewing_book, application_submit, application_decided,
 * escrow_initiated, escrow_held, escrow_released, dispute_opened.
 */

import { createHash } from "node:crypto";
import { logger } from "../lib/logger";
import { eventQueue } from "../workers/queues";

export type EventType =
  | "search"
  | "search_click"
  | "listing_view"
  | "listing_published"
  | "listing_rented"
  | "inquiry_submit"
  | "inquiry_responded"
  | "viewing_book"
  | "viewing_confirmed"
  | "viewing_completed"
  | "application_submit"
  | "application_decided"
  | "escrow_initiated"
  | "escrow_held"
  | "escrow_released"
  | "dispute_opened"
  | "fraud_reported"
  | "saved_listing"
  | "ai_call"
  | "ai_feedback";

export interface RecordEventInput {
  type: EventType;
  actorId?: string | null;
  actorRole?: "TENANT" | "AGENT" | "LANDLORD" | "ADMIN" | null;
  targetType?: string | null;
  targetId?: string | null;
  properties?: Record<string, unknown>;
  variantKey?: string;
  sessionId?: string;
  ip?: string | null;
  userAgent?: string | null;
}

export function hashIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  // Salt with the JWT secret so the hash isn't reversible from leaked DB alone.
  const salt = process.env.JWT_SECRET ?? "dev-pepper";
  return createHash("sha256").update(`${salt}:ip:${ip}`).digest("hex").slice(0, 24);
}

/** Fire-and-forget. Never throws — analytics failures must not break requests. */
export function recordEvent(input: RecordEventInput): void {
  // Truncate properties so a runaway log line can't fill up the queue payload.
  const props = input.properties ? trim(input.properties, 4000) : undefined;

  eventQueue
    .add(
      "ev",
      {
        type: input.type,
        actorId: input.actorId ?? null,
        actorRole: input.actorRole ?? null,
        targetType: input.targetType ?? null,
        targetId: input.targetId ?? null,
        properties: props,
        variantKey: input.variantKey ?? null,
        sessionId: input.sessionId ?? null,
        ipHash: hashIp(input.ip),
        userAgent: input.userAgent ?? null,
      },
      { removeOnComplete: 1000, removeOnFail: 100 },
    )
    .catch((err) => {
      // Worst case: events lost for this period — never break the request.
      logger.warn({ err }, "event enqueue failed");
    });
}

function trim(obj: Record<string, unknown>, maxBytes: number): Record<string, unknown> {
  const json = JSON.stringify(obj);
  if (json.length <= maxBytes) return obj;
  return { _truncated: true, preview: json.slice(0, maxBytes) };
}
