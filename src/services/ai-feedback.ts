/**
 * AI feedback — admins grade AiOutput rows.
 *
 * Grades drive two downstream pipelines:
 *   1. Eval mining: rows with promoteToEval=true become regression tests.
 *   2. Few-shot curation: top-graded `edited` outputs get reviewed for
 *      inclusion in prompts as exemplars (manual step).
 */

import { z } from "zod";
import { prisma } from "../db/client";
import { ConflictError, NotFoundError } from "../lib/errors";
import { recordEvent } from "./events";

export const FeedbackSchema = z.object({
  grade: z.enum(["correct", "wrong", "edited", "partial"]),
  reason: z.string().max(2000).optional(),
  editedOutput: z.unknown().optional(),
  promoteToEval: z.boolean().default(false),
});

export async function submitFeedback(
  aiOutputId: string,
  graderId: string,
  input: z.infer<typeof FeedbackSchema>,
) {
  const data = FeedbackSchema.parse(input);
  const out = await prisma.aiOutput.findUnique({ where: { id: aiOutputId } });
  if (!out) throw new NotFoundError("AiOutput");

  if (data.grade === "edited" && !data.editedOutput) {
    throw new ConflictError("editedOutput required when grade=edited");
  }

  const fb = await prisma.aiFeedback.create({
    data: {
      aiOutputId,
      graderId,
      grade: data.grade,
      reason: data.reason,
      editedOutput: (data.editedOutput as object | undefined) ?? undefined,
      promoteToEval: data.promoteToEval,
    },
  });

  recordEvent({
    type: "ai_feedback",
    actorId: graderId,
    actorRole: "ADMIN",
    targetType: "ai_output",
    targetId: aiOutputId,
    properties: { grade: data.grade, promoteToEval: data.promoteToEval, task: out.task },
  });

  return fb;
}

/**
 * Admin review queue: the most recent ungraded outputs of a given task.
 * Bias toward low-confidence cases (active learning) when present.
 */
export async function listUngraded(opts: {
  task?: string;
  limit?: number;
  /** "low_confidence" pulls outputs with confidence < 0.6 first. */
  strategy?: "recent" | "low_confidence";
}) {
  const limit = Math.min(opts.limit ?? 50, 200);
  const where = {
    ...(opts.task ? { task: opts.task } : {}),
    feedback: { none: {} },
  };

  if (opts.strategy === "low_confidence") {
    return prisma.aiOutput.findMany({
      where: { ...where, confidence: { lt: 0.6 } },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  }
  return prisma.aiOutput.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

/** Aggregate metrics for the admin dashboard. */
export async function feedbackMetrics(opts: { sinceDays?: number } = {}) {
  const since = new Date(Date.now() - (opts.sinceDays ?? 7) * 86_400_000);
  const rows = await prisma.aiFeedback.groupBy({
    by: ["grade"],
    where: { createdAt: { gte: since } },
    _count: { _all: true },
  });
  const total = rows.reduce((s, r) => s + r._count._all, 0);
  const byGrade = Object.fromEntries(rows.map((r) => [r.grade, r._count._all]));
  return {
    sinceDays: opts.sinceDays ?? 7,
    total,
    byGrade,
    correctRate: total > 0 ? (byGrade.correct ?? 0) / total : null,
    editRate: total > 0 ? (byGrade.edited ?? 0) / total : null,
  };
}

/**
 * Eval mining: pull recent `promoteToEval` cases. Used by a weekly job
 * (or manual `pnpm ai:eval-mine`) that writes them to tests/evals/.
 */
export async function listEvalCandidates(opts: { sinceDays?: number; limit?: number } = {}) {
  const since = new Date(Date.now() - (opts.sinceDays ?? 7) * 86_400_000);
  return prisma.aiFeedback.findMany({
    where: { promoteToEval: true, createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    take: opts.limit ?? 50,
    include: { aiOutput: true },
  });
}
