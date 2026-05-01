/**
 * AI Router — the single entry point for every Claude call in the app.
 *
 * Why route here:
 *  - One place to enforce model selection rules (cost discipline).
 *  - One place to apply prompt caching consistently.
 *  - One place to emit cost telemetry per task type.
 *  - One place to swap models when prices change or new ones ship.
 *  - One place to capture AI outputs for the ML feedback loop.
 *  - One place to apply prompt versioning + A/B routing.
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
import { createHash } from "node:crypto";
import { logger } from "../lib/logger";
import { recordAiCost } from "../lib/metrics";
import { prisma } from "../db/client";
import { ensurePromptVersion, pickVariant } from "./prompt-versions";

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
  /** Caller-supplied context for ML capture. Strongly recommended. */
  actorId?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  /** Self-reported confidence for the output, populated by callers
   *  whose schemas include a confidence field. */
}

export interface RunResult<T = string> {
  content: T;
  raw: Anthropic.Message;
  costUsd: number;
  tier: Tier;
  /** AiOutput row id — pass to AiFeedback when the agent edits the result. */
  aiOutputId?: string;
  /** Variant used (default | canary:abc123). Useful for analytics. */
  variantKey?: string;
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

  // Prompt versioning + A/B variant resolution.
  const variant = await pickVariant({
    task: opts.task,
    actorKey: opts.actorId ?? opts.targetId ?? null,
    defaultText: opts.systemPrompt,
  }).catch((err) => {
    // Never let versioning errors block AI calls.
    logger.warn({ err, task: opts.task }, "pickVariant failed; using default");
    return { id: "unversioned", text: opts.systemPrompt, variantKey: "default" };
  });

  const model = MODEL_FOR_TIER[tier];
  const messages = [...opts.messages];
  if (opts.jsonMode) {
    messages.push({ role: "assistant", content: "{" });
  }

  const startedAt = Date.now();
  const response = await client.messages.create({
    model,
    max_tokens: opts.maxOutputTokens ?? 1024,
    system: [
      {
        type: "text",
        text: variant.text,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages,
  });
  const latencyMs = Date.now() - startedAt;

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
    content = JSON.parse("{" + text) as T;
  } else {
    content = text as T;
  }

  // Capture for the feedback loop. Fire-and-forget; never blocks the response.
  let aiOutputId: string | undefined;
  if (variant.id !== "unversioned") {
    try {
      aiOutputId = await captureOutput({
        task: opts.task,
        tier,
        model,
        promptVersionId: variant.id,
        actorId: opts.actorId ?? null,
        targetType: opts.targetType ?? null,
        targetId: opts.targetId ?? null,
        variantKey: variant.variantKey,
        systemPrompt: variant.text,
        userMessages: opts.messages,
        output: content as unknown,
        costUsd,
        latencyMs,
        confidence: extractConfidence(content),
      });
    } catch (err) {
      logger.warn({ err, task: opts.task }, "ai output capture failed");
    }
  }

  return { content, raw: response, costUsd, tier, aiOutputId, variantKey: variant.variantKey };
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

// ---- Internal helpers ----

interface CaptureOpts {
  task: TaskType;
  tier: Tier;
  model: string;
  promptVersionId: string;
  actorId: string | null;
  targetType: string | null;
  targetId: string | null;
  variantKey: string;
  systemPrompt: string;
  userMessages: Anthropic.MessageParam[];
  output: unknown;
  costUsd: number;
  latencyMs: number;
  confidence: number | null;
}

async function captureOutput(c: CaptureOpts): Promise<string | undefined> {
  // Make sure the prompt version exists (router uses it as FK).
  await ensurePromptVersion({ task: c.task, text: c.systemPrompt }).catch(() => undefined);

  const inputBuf = JSON.stringify({ s: c.systemPrompt, m: c.userMessages });
  const inputHash = createHash("sha256").update(inputBuf).digest("hex").slice(0, 32);
  const preview = compactPreview(c.userMessages, 500);

  const row = await prisma.aiOutput.create({
    data: {
      task: c.task,
      tier: c.tier,
      model: c.model,
      promptVersionId: c.promptVersionId,
      actorId: c.actorId,
      targetType: c.targetType,
      targetId: c.targetId,
      variantKey: c.variantKey,
      inputHash,
      inputPreview: preview,
      output: serializeOutput(c.output),
      costUsd: c.costUsd,
      latencyMs: c.latencyMs,
      confidence: c.confidence,
    },
  });
  return row.id;
}

function serializeOutput(content: unknown): object {
  if (typeof content === "string") return { text: content };
  if (content && typeof content === "object") return content as object;
  return { value: content };
}

function compactPreview(msgs: Anthropic.MessageParam[], maxChars: number): string {
  const parts: string[] = [];
  for (const m of msgs) {
    if (typeof m.content === "string") {
      parts.push(`[${m.role}] ${m.content}`);
    } else {
      const text = m.content
        .map((b) => (b.type === "text" ? b.text : `[${b.type}]`))
        .join(" ");
      parts.push(`[${m.role}] ${text}`);
    }
    if (parts.join("\n").length > maxChars) break;
  }
  return parts.join("\n").slice(0, maxChars);
}

function extractConfidence(content: unknown): number | null {
  if (content && typeof content === "object" && "confidence" in content) {
    const c = (content as { confidence: unknown }).confidence;
    if (typeof c === "number" && c >= 0 && c <= 1) return c;
  }
  return null;
}
