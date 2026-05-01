/**
 * AI Router — the single entry point for every Claude call in the app.
 *
 * Why route here:
 *  - One place to enforce model selection rules (cost discipline).
 *  - One place to apply prompt caching consistently.
 *  - One place to emit cost telemetry per task type.
 *  - One place to swap models when prices change or new ones ship.
 *
 * Rules (also documented in CLAUDE.md):
 *   Haiku  — high volume, simple extraction, classification, drafting
 *   Sonnet — vision, reasoning, structured output where quality matters
 *   Opus   — only for explicit escalation flag (disputes, complex agents)
 *
 * Pricing reference (April 2026, per million tokens):
 *   Haiku 4.5  : $1 in / $5 out      (cache hit: $0.10 in)
 *   Sonnet 4.6 : $3 in / $15 out     (cache hit: $0.30 in)
 *   Opus 4.7   : $5 in / $25 out     (cache hit: $0.50 in)
 *   Batch API  : 50% off all rates
 */

import Anthropic from "@anthropic-ai/sdk";
import { logger } from "../lib/logger";
import { recordAiCost } from "../lib/metrics";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

export type Tier = "haiku" | "sonnet" | "opus";

export type TaskType =
  | "listing_categorize"      // haiku
  | "listing_generate"        // sonnet (vision)
  | "search_parse"            // haiku
  | "fraud_score"             // sonnet
  | "tenant_screen"           // sonnet
  | "auto_reply_draft"        // haiku
  | "notification_copy"       // haiku
  | "dispute_resolve"         // opus
  | "agent_chat";             // sonnet

const TIER_FOR_TASK: Record<TaskType, Tier> = {
  listing_categorize: "haiku",
  listing_generate: "sonnet",
  search_parse: "haiku",
  fraud_score: "sonnet",
  tenant_screen: "sonnet",
  auto_reply_draft: "haiku",
  notification_copy: "haiku",
  dispute_resolve: "opus",
  agent_chat: "sonnet",
};

const MODEL_FOR_TIER: Record<Tier, string> = {
  haiku: process.env.CLAUDE_MODEL_HAIKU ?? "claude-haiku-4-5-20251001",
  sonnet: process.env.CLAUDE_MODEL_SONNET ?? "claude-sonnet-4-6",
  opus: process.env.CLAUDE_MODEL_OPUS ?? "claude-opus-4-7",
};

// $/MTok — used for cost telemetry, NOT billing.
const RATES = {
  haiku: { in: 1, out: 5, cacheRead: 0.1, cacheWrite: 1.25 },
  sonnet: { in: 3, out: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  opus: { in: 5, out: 25, cacheRead: 0.5, cacheWrite: 6.25 },
};

export interface RunOptions {
  task: TaskType;
  /** Static prompt — will be cached. Should be > 1024 tokens for cache to help. */
  systemPrompt: string;
  /** User-side messages. */
  messages: Anthropic.MessageParam[];
  /** Force a tier upgrade (rarely needed). Logs a warning. */
  escalate?: boolean;
  /** Hard cap on output tokens. Default 1024. */
  maxOutputTokens?: number;
  /** Force JSON mode via prefilled assistant turn. */
  jsonMode?: boolean;
  /** Use Batch API (50% off, async). For non-realtime workloads only. */
  batch?: boolean;
}

export interface RunResult<T = string> {
  content: T;
  raw: Anthropic.Message;
  costUsd: number;
  tier: Tier;
}

export async function run<T = string>(opts: RunOptions): Promise<RunResult<T>> {
  let tier = TIER_FOR_TASK[opts.task];

  if (opts.escalate) {
    const upgrade: Record<Tier, Tier> = { haiku: "sonnet", sonnet: "opus", opus: "opus" };
    const newTier = upgrade[tier];
    if (newTier !== tier) {
      logger.warn({ task: opts.task, from: tier, to: newTier }, "ai escalation");
      tier = newTier;
    }
  }

  const model = MODEL_FOR_TIER[tier];
  const messages = [...opts.messages];
  if (opts.jsonMode) {
    messages.push({ role: "assistant", content: "{" });
  }

  const response = await client.messages.create({
    model,
    max_tokens: opts.maxOutputTokens ?? 1024,
    // Cache the system prompt — saves ~90% on input cost for repeated calls.
    // The system prompt MUST be stable across calls for this to help.
    system: [
      {
        type: "text",
        text: opts.systemPrompt,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages,
  });

  const usage = response.usage;
  const rate = RATES[tier];
  const costUsd =
    (usage.input_tokens * rate.in) / 1_000_000 +
    (usage.output_tokens * rate.out) / 1_000_000 +
    ((usage.cache_read_input_tokens ?? 0) * rate.cacheRead) / 1_000_000 +
    ((usage.cache_creation_input_tokens ?? 0) * rate.cacheWrite) / 1_000_000;

  recordAiCost({ task: opts.task, tier, costUsd, ...usage });

  let content: T;
  const textBlock = response.content.find((b) => b.type === "text");
  const text = textBlock && textBlock.type === "text" ? textBlock.text : "";

  if (opts.jsonMode) {
    // Re-add the prefill we sent so the JSON parses.
    content = JSON.parse("{" + text) as T;
  } else {
    content = text as T;
  }

  return { content, raw: response, costUsd, tier };
}

/**
 * Convenience helper for vision tasks. Photos are passed as R2 URLs;
 * Anthropic fetches them server-side.
 */
export async function runVision<T = string>(
  opts: RunOptions & { imageUrls: string[]; userText: string }
): Promise<RunResult<T>> {
  const content: Anthropic.ContentBlockParam[] = [
    ...opts.imageUrls.map<Anthropic.ContentBlockParam>((url) => ({
      type: "image",
      source: { type: "url", url },
    })),
    { type: "text", text: opts.userText },
  ];
  return run<T>({
    ...opts,
    messages: [{ role: "user", content }],
  });
}
