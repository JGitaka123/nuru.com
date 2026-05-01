/**
 * Prompt version registry + A/B routing.
 *
 * Each prompt text → unique version id (sha256 prefix).
 * On first use of a new prompt text, we register it as a new PromptVersion.
 * Outputs reference the version they used.
 *
 * A/B routing: callers can register multiple variants for a task. We pick
 * one deterministically based on `hash(actorId + task) → [0,1)` mapped
 * against rollout fractions. Without an actorId, we fall back to the
 * default (full-traffic, isActive=true) version.
 */

import { createHash } from "node:crypto";
import { prisma } from "../db/client";
import type { TaskType } from "./router";

export function versionIdFor(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

const ensuredCache = new Set<string>();

/**
 * Idempotently ensure a prompt version exists in the registry. Returns
 * the version id. Safe to call on every request — caches in-process.
 */
export async function ensurePromptVersion(opts: {
  task: TaskType;
  text: string;
  description?: string;
}): Promise<string> {
  const id = versionIdFor(opts.text);
  if (ensuredCache.has(id)) return id;

  await prisma.promptVersion.upsert({
    where: { id },
    create: {
      id,
      task: opts.task,
      text: opts.text,
      description: opts.description ?? null,
      isActive: true,
      rollout: 1.0,
    },
    update: {},
  });
  ensuredCache.add(id);
  return id;
}

/**
 * Pick a variant for a (task, actor) pair, deterministically.
 * Returns the active version with rollout=1, OR a canary if the actor
 * falls within its rollout fraction.
 *
 * In MVP we have one active version per task. This function exists so
 * we can ship canaries without code changes downstream.
 */
export async function pickVariant(opts: {
  task: TaskType;
  actorKey?: string | null;
  defaultText: string;
}): Promise<{ id: string; text: string; variantKey: string }> {
  const defaultId = await ensurePromptVersion({ task: opts.task, text: opts.defaultText });

  // Canaries: any active version with rollout < 1 for this task.
  const canaries = await prisma.promptVersion.findMany({
    where: { task: opts.task, isActive: true, rollout: { lt: 1.0 } },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  if (canaries.length === 0) {
    return { id: defaultId, text: opts.defaultText, variantKey: "default" };
  }

  // Map actorKey → bucket [0,1).
  const bucket = bucketFor(opts.actorKey ?? "anon");
  let cumulative = 0;
  for (const c of canaries) {
    cumulative += c.rollout;
    if (bucket < cumulative) {
      return { id: c.id, text: c.text, variantKey: `canary:${c.id.slice(0, 6)}` };
    }
  }
  return { id: defaultId, text: opts.defaultText, variantKey: "default" };
}

function bucketFor(key: string): number {
  const h = createHash("sha256").update(key).digest();
  // First 4 bytes → uint32 → divide.
  const n = h.readUInt32BE(0);
  return n / 0xffffffff;
}
