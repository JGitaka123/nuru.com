/**
 * Autonomous client-management tasks.
 *
 * Two halves:
 *   1. SCANNERS — scheduled jobs that look at subscription + usage state
 *      and create AgentTask rows when a trigger fires.
 *   2. EXECUTORS — process pending tasks: draft message via AI, decide
 *      whether to auto-send (confidence ≥ 0.7) or punt to REVIEW_NEEDED.
 *
 * Anti-spam: ≤ 2 outbound messages per user per week. The runner enforces
 * this; admin queue surface the throttle reason.
 */

import type { AgentTaskKind, Subscription } from "@prisma/client";
import { prisma } from "../db/client";
import { logger } from "../lib/logger";
import { draftClientSuccess } from "../prompts/client-success";
import { send as sendEmail } from "./email";
import { sendSms } from "./notifications";
import { recordEvent } from "./events";

const AUTO_EXECUTE_CONFIDENCE = 0.7;
const MAX_MESSAGES_PER_WEEK = 2;

interface SubscriptionWithUser {
  id: string;
  userId: string;
  planTier: Subscription["planTier"];
  status: Subscription["status"];
  trialEndsAt: Date | null;
  currentPeriodEnd: Date;
  failedAttempts: number;
  cancelAtPeriodEnd: boolean;
}

/** Run all scanners. Idempotent — won't double-create same task. */
export async function scanAndCreateTasks(): Promise<{ created: number }> {
  const now = new Date();
  let created = 0;

  // 1. Onboarding nudge: signed up 3+ days ago, AGENT/LANDLORD, 0 listings.
  const stale = new Date(now.getTime() - 3 * 86_400_000);
  const noListingUsers = await prisma.user.findMany({
    where: {
      role: { in: ["AGENT", "LANDLORD"] },
      createdAt: { lte: stale },
      listings: { none: {} },
    },
    select: { id: true },
    take: 200,
  });
  for (const u of noListingUsers) {
    if (await ensureTask(u.id, "ONBOARDING_NUDGE", now)) created++;
  }

  // 2. Trial ending in 3 days / today / ended.
  const trialing = await prisma.subscription.findMany({
    where: { status: "TRIALING", trialEndsAt: { not: null } },
    take: 500,
  });
  for (const sub of trialing) {
    if (!sub.trialEndsAt) continue;
    const daysLeft = Math.ceil((sub.trialEndsAt.getTime() - now.getTime()) / 86_400_000);
    if (daysLeft <= 0) {
      if (await ensureTask(sub.userId, "TRIAL_ENDED", now, { priority: 90 })) created++;
    } else if (daysLeft === 1) {
      if (await ensureTask(sub.userId, "TRIAL_ENDING_TODAY", now, { priority: 80 })) created++;
    } else if (daysLeft === 3) {
      if (await ensureTask(sub.userId, "TRIAL_ENDING_3_DAYS", now, { priority: 70 })) created++;
    }
  }

  // 3. Payment failed retry / final.
  const pastDue = await prisma.subscription.findMany({
    where: { status: "PAST_DUE" },
    take: 500,
  });
  for (const sub of pastDue) {
    const kind: AgentTaskKind = sub.failedAttempts >= 3 ? "PAYMENT_FAILED_FINAL" : "PAYMENT_FAILED_RETRY";
    if (await ensureTask(sub.userId, kind, now, { priority: kind === "PAYMENT_FAILED_FINAL" ? 95 : 75 })) created++;
  }

  // 4. Renewal reminder: ACTIVE, 5 days before currentPeriodEnd.
  const renewWindow = new Date(now.getTime() + 5 * 86_400_000);
  const renewing = await prisma.subscription.findMany({
    where: {
      status: "ACTIVE",
      currentPeriodEnd: { gte: now, lte: renewWindow },
      cancelAtPeriodEnd: false,
      planTier: { not: "TRIAL" },
    },
    take: 500,
  });
  for (const sub of renewing) {
    if (await ensureTask(sub.userId, "RENEWAL_REMINDER", now, { priority: 40 })) created++;
  }

  // 5. Churn risk: ACTIVE, paid plan, 0 inquiries received in last 30 days
  // AND >= 3 active listings (so they have something to engage with).
  const monthAgo = new Date(now.getTime() - 30 * 86_400_000);
  const possiblyChurning = await prisma.subscription.findMany({
    where: { status: "ACTIVE", planTier: { not: "TRIAL" } },
    take: 500,
  });
  for (const sub of possiblyChurning) {
    const [activeListings, recentInquiries] = await Promise.all([
      prisma.listing.count({ where: { agentId: sub.userId, status: "ACTIVE" } }),
      prisma.inquiry.count({ where: { listing: { agentId: sub.userId }, createdAt: { gte: monthAgo } } }),
    ]);
    if (activeListings >= 3 && recentInquiries === 0) {
      if (await ensureTask(sub.userId, "CHURN_RISK", now, { priority: 60 })) created++;
    }
  }

  // 6. Upsell: hitting cap.
  const subs = await prisma.subscription.findMany({
    where: { status: "ACTIVE", planTier: { in: ["BRONZE", "SILVER", "GOLD"] } },
    include: { plan: true },
    take: 500,
  });
  for (const sub of subs) {
    if (sub.plan.maxActiveListings === null) continue;
    const activeCount = await prisma.listing.count({
      where: { agentId: sub.userId, status: "ACTIVE" },
    });
    if (activeCount >= sub.plan.maxActiveListings) {
      if (await ensureTask(sub.userId, "UPSELL_OPPORTUNITY", now, { priority: 50 })) created++;
    }
  }

  logger.info({ created }, "agent-tasks scanner");
  return { created };
}

async function ensureTask(
  userId: string,
  kind: AgentTaskKind,
  dueAt: Date,
  opts: { priority?: number; payload?: object } = {},
): Promise<boolean> {
  // Skip if an open task of this kind exists for this user in the last 14 days.
  const recent = new Date(Date.now() - 14 * 86_400_000);
  const existing = await prisma.agentTask.findFirst({
    where: {
      userId,
      kind,
      createdAt: { gte: recent },
      status: { in: ["PENDING", "IN_PROGRESS", "REVIEW_NEEDED", "COMPLETED"] },
    },
  });
  if (existing) return false;

  await prisma.agentTask.create({
    data: {
      userId,
      kind,
      dueAt,
      priority: opts.priority ?? 50,
      payload: (opts.payload as object | undefined) ?? undefined,
    },
  });
  return true;
}

interface TaskExecResult {
  status: "auto_executed" | "review_queued" | "throttled" | "skipped";
  reason?: string;
}

/** Run a single PENDING task. */
export async function executeTask(taskId: string): Promise<TaskExecResult> {
  const task = await prisma.agentTask.findUnique({ where: { id: taskId } });
  if (!task || task.status !== "PENDING") return { status: "skipped", reason: "not pending" };

  // Throttle: max 2 outbound messages per user per week.
  const weekAgo = new Date(Date.now() - 7 * 86_400_000);
  const recentSent = await prisma.agentTask.count({
    where: {
      userId: task.userId,
      status: "COMPLETED",
      completedAt: { gte: weekAgo },
      channelsTried: { isEmpty: false },
    },
  });
  if (recentSent >= MAX_MESSAGES_PER_WEEK) {
    await prisma.agentTask.update({
      where: { id: task.id },
      data: { status: "REVIEW_NEEDED", resultNote: "throttled — too many recent messages" },
    });
    return { status: "throttled", reason: "max msgs/week reached" };
  }

  // Mark in-progress so a parallel runner doesn't double-execute.
  await prisma.agentTask.update({ where: { id: task.id }, data: { status: "IN_PROGRESS" } });

  try {
    const ctx = await buildContext(task.userId, task.kind);
    if (!ctx) {
      await complete(task.id, "user not eligible", null);
      return { status: "skipped", reason: "no context" };
    }

    const draft = await draftClientSuccess(ctx, { actorId: null, targetId: task.id });

    await prisma.agentTask.update({
      where: { id: task.id },
      data: {
        aiDraft: draft.content as object,
        aiConfidence: draft.content.confidence,
      },
    });

    if (draft.content.confidence < AUTO_EXECUTE_CONFIDENCE) {
      await prisma.agentTask.update({
        where: { id: task.id },
        data: { status: "REVIEW_NEEDED", resultNote: "low confidence — manual review" },
      });
      return { status: "review_queued", reason: "low confidence" };
    }

    // Auto-execute critical state transitions BEFORE messaging.
    if (task.kind === "TRIAL_ENDED") {
      await downgradeListingsAfterTrial(task.userId);
    }
    if (task.kind === "PAYMENT_FAILED_FINAL") {
      await suspendSubscription(task.userId);
    }

    // Send SMS + email.
    const channels: string[] = [];
    const user = await prisma.user.findUniqueOrThrow({ where: { id: task.userId } });
    if (user.phoneE164) {
      try {
        await sendSms(user.phoneE164, draft.content.smsBody);
        channels.push("sms");
      } catch (e) {
        logger.warn({ err: e, taskId: task.id }, "task sms failed");
      }
    }
    if (user.email) {
      try {
        const ctaUrl = absoluteUrl(draft.content.primaryCtaUrl);
        const html = `<p>${escapeHtml(draft.content.emailBody).replace(/\n\n/g, "</p><p>")}</p>
<p><a href="${ctaUrl}" style="background:#f5840b;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;display:inline-block">${escapeHtml(draft.content.primaryCta)}</a></p>`;
        const r = await sendEmail({
          to: user.email,
          subject: draft.content.emailSubject,
          text: draft.content.emailBody + `\n\n${draft.content.primaryCta}: ${ctaUrl}`,
          html,
          marketing: false,           // these are account/transactional
          tags: [{ name: "task_kind", value: task.kind }],
        });
        if (r.sent) channels.push("email");
      } catch (e) {
        logger.warn({ err: e, taskId: task.id }, "task email failed");
      }
    }

    await complete(task.id, "auto-executed", channels);
    recordEvent({
      type: "ai_call",
      actorId: task.userId,
      targetType: "agent_task",
      targetId: task.id,
      properties: { kind: task.kind, channels, confidence: draft.content.confidence },
    });
    return { status: "auto_executed" };
  } catch (err) {
    await prisma.agentTask.update({
      where: { id: task.id },
      data: {
        status: "REVIEW_NEEDED",
        resultNote: `error: ${err instanceof Error ? err.message.slice(0, 300) : "unknown"}`,
      },
    });
    return { status: "skipped", reason: "execution error" };
  }
}

async function complete(id: string, note: string, channels: string[] | null) {
  await prisma.agentTask.update({
    where: { id },
    data: {
      status: "COMPLETED",
      completedAt: new Date(),
      resultNote: note,
      channelsTried: channels ?? [],
    },
  });
}

async function buildContext(userId: string, kind: AgentTaskKind) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, role: true, preferredLang: true, createdAt: true },
  });
  if (!user) return null;

  const sub = await prisma.subscription.findUnique({ where: { userId } });
  const monthAgo = new Date(Date.now() - 30 * 86_400_000);
  const [activeListings, inq, apps, rented] = await Promise.all([
    prisma.listing.count({ where: { agentId: userId, status: "ACTIVE" } }),
    prisma.inquiry.count({ where: { listing: { agentId: userId }, createdAt: { gte: monthAgo } } }),
    prisma.application.count({ where: { listing: { agentId: userId }, createdAt: { gte: monthAgo } } }),
    prisma.listing.count({ where: { agentId: userId, status: "RENTED" } }),
  ]);

  const daysSinceSignup = Math.floor((Date.now() - user.createdAt.getTime()) / 86_400_000);
  const daysUntilTrialEnd = sub?.trialEndsAt
    ? Math.ceil((sub.trialEndsAt.getTime() - Date.now()) / 86_400_000)
    : null;

  return {
    user: {
      name: user.name,
      role: user.role,
      preferredLang: user.preferredLang,
      daysSinceSignup,
    },
    subscription: {
      planTier: sub?.planTier ?? "TRIAL",
      status: sub?.status ?? "TRIALING",
      trialEndsAt: sub?.trialEndsAt?.toISOString() ?? null,
      daysUntilTrialEnd,
      failedAttempts: sub?.failedAttempts ?? 0,
    },
    usage: {
      activeListings,
      totalInquiriesLast30d: inq,
      totalApplicationsLast30d: apps,
      totalRented: rented,
      daysSinceLastLogin: null,
    },
    taskKind: kind,
  };
}

async function downgradeListingsAfterTrial(userId: string) {
  await prisma.listing.updateMany({
    where: { agentId: userId, status: "ACTIVE" },
    data: { status: "PAUSED" },
  });
  await prisma.subscription.update({
    where: { userId },
    data: { status: "EXPIRED" },
  });
}

async function suspendSubscription(userId: string) {
  await prisma.subscription.update({
    where: { userId },
    data: { status: "PAUSED" },
  });
  await prisma.listing.updateMany({
    where: { agentId: userId, status: { in: ["ACTIVE", "PENDING_REVIEW"] } },
    data: { status: "PAUSED" },
  });
}

function absoluteUrl(path: string): string {
  const base = process.env.WEB_URL ?? "https://nuru.com";
  if (path.startsWith("http")) return path;
  return `${base}${path.startsWith("/") ? "" : "/"}${path}`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

/** Admin manually approves/edits a REVIEW_NEEDED task. */
export async function approveTask(taskId: string, adminId: string, edits?: { smsBody?: string; emailSubject?: string; emailBody?: string }) {
  const task = await prisma.agentTask.findUnique({ where: { id: taskId } });
  if (!task) throw new Error("Task not found");
  if (task.status !== "REVIEW_NEEDED") throw new Error(`Task is ${task.status}`);
  const draft = task.aiDraft as { smsBody?: string; emailSubject?: string; emailBody?: string; primaryCta?: string; primaryCtaUrl?: string } | null;
  if (!draft) throw new Error("Task has no draft to approve");

  const finalDraft = { ...draft, ...edits };
  await prisma.agentTask.update({
    where: { id: taskId },
    data: { aiDraft: finalDraft as object, status: "PENDING" },
  });
  // Re-run executor from approved draft. Easier: just call execute again,
  // which will compute confidence — bypass throttle by direct send.
  return finalDraft;
}
