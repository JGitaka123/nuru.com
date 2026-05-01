/**
 * Outreach campaigns + email lifecycle.
 *
 * Flow:
 *   1. Admin creates an OutreachCampaign (target filters + template key + dailyCap).
 *   2. enrollLeads() finds matching leads and queues OutreachEmail rows in QUEUED.
 *   3. Worker (src/workers/outreach-sender.ts) drains the queue:
 *      a. Calls composeOutreach() per email — Sonnet drafts subject + body.
 *      b. If skip=true OR lead is suppressed → mark SUPPRESSED.
 *      c. Sends via Resend; records messageId.
 *   4. Resend webhooks update OutreachEmail.status as opens/clicks/bounces arrive.
 *   5. Auto-progress lead.stage: CONTACTED → ENGAGED on open.
 */

import { z } from "zod";
import type { LeadStage, LeadType } from "@prisma/client";
import { prisma } from "../db/client";
import { ConflictError, NotFoundError } from "../lib/errors";
import { logger } from "../lib/logger";
import { outreachSendQueue } from "../workers/queues";

export const CampaignInputSchema = z.object({
  name: z.string().min(3).max(120),
  description: z.string().max(2000).optional(),
  targetTypes: z.array(z.enum(["AUCTIONEER", "BANK", "AGENT_AGENCY", "LANDLORD", "DEVELOPER", "DEVELOPER", "COURT", "OTHER"])).min(1),
  targetCities: z.array(z.string()).default([]),
  targetStages: z.array(z.enum(["NEW", "ENRICHED", "QUALIFIED", "CONTACTED", "ENGAGED", "ONBOARDED", "REJECTED", "UNSUBSCRIBED", "BOUNCED"])).default(["QUALIFIED"]),
  templatePromptKey: z.enum([
    "bank_auction_v1",
    "auctioneer_v1",
    "agent_warm_v1",
    "developer_v1",
    "landlord_direct_v1",
  ]),
  dailyCap: z.number().int().min(1).max(10_000).default(100),
});

export async function createCampaign(input: z.infer<typeof CampaignInputSchema>) {
  const data = CampaignInputSchema.parse(input);
  return prisma.outreachCampaign.create({
    data: {
      ...data,
      isActive: false,
      targetTypes: data.targetTypes as LeadType[],
      targetStages: data.targetStages as LeadStage[],
    },
  });
}

export async function setCampaignActive(id: string, active: boolean) {
  const c = await prisma.outreachCampaign.findUnique({ where: { id } });
  if (!c) throw new NotFoundError("Campaign");
  return prisma.outreachCampaign.update({
    where: { id },
    data: {
      isActive: active,
      ...(active && !c.startedAt ? { startedAt: new Date() } : {}),
      ...(!active ? { endedAt: new Date() } : {}),
    },
  });
}

/**
 * Find leads that match the campaign filters AND have no OutreachEmail
 * yet for this campaign, and queue them. Caps at `dailyCap` per call.
 */
export async function enrollLeads(campaignId: string) {
  const campaign = await prisma.outreachCampaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new NotFoundError("Campaign");
  if (!campaign.isActive) throw new ConflictError("Campaign is not active");

  const leads = await prisma.lead.findMany({
    where: {
      type: { in: campaign.targetTypes },
      stage: { in: campaign.targetStages },
      ...(campaign.targetCities.length > 0 ? { city: { in: campaign.targetCities } } : {}),
      email: { not: null },
      // Already have an outreach email for this campaign? Skip.
      emails: { none: { campaignId: campaign.id } },
    },
    take: campaign.dailyCap,
    orderBy: { createdAt: "asc" },
  });

  let queued = 0;
  for (const lead of leads) {
    await prisma.outreachEmail.create({
      data: {
        leadId: lead.id,
        campaignId: campaign.id,
        templatePromptKey: campaign.templatePromptKey,
        subject: "(pending compose)",
        bodyText: "(pending compose)",
        status: "QUEUED",
      },
    });
    queued++;
  }

  if (queued > 0) {
    await outreachSendQueue.add(
      "drain",
      { campaignId: campaign.id },
      { jobId: `drain:${campaign.id}:${Date.now()}`, attempts: 3 },
    ).catch((e) => logger.warn({ err: e }, "could not enqueue outreach drain"));
  }

  return { campaignId, queued, leadsConsidered: leads.length };
}

export async function listCampaignEmails(campaignId: string, limit = 200) {
  return prisma.outreachEmail.findMany({
    where: { campaignId },
    orderBy: { updatedAt: "desc" },
    include: {
      lead: { select: { id: true, organizationName: true, email: true, type: true, stage: true } },
    },
    take: limit,
  });
}

export async function campaignMetrics(campaignId: string) {
  const counts = await prisma.outreachEmail.groupBy({
    by: ["status"],
    where: { campaignId },
    _count: { _all: true },
  });
  const byStatus = Object.fromEntries(counts.map((c) => [c.status, c._count._all]));
  const total = counts.reduce((s, c) => s + c._count._all, 0);
  const sent = (byStatus.SENT ?? 0) + (byStatus.DELIVERED ?? 0) + (byStatus.OPENED ?? 0) + (byStatus.CLICKED ?? 0) + (byStatus.REPLIED ?? 0);
  const opened = (byStatus.OPENED ?? 0) + (byStatus.CLICKED ?? 0) + (byStatus.REPLIED ?? 0);
  const clicked = (byStatus.CLICKED ?? 0) + (byStatus.REPLIED ?? 0);
  return {
    total,
    byStatus,
    rates: {
      open: sent > 0 ? opened / sent : null,
      click: sent > 0 ? clicked / sent : null,
      reply: sent > 0 ? (byStatus.REPLIED ?? 0) / sent : null,
      bounce: total > 0 ? ((byStatus.BOUNCED ?? 0) / total) : null,
    },
  };
}

/**
 * Resend webhook handler — flips OutreachEmail status and updates
 * Lead.stage on engagement.
 */
export async function applyResendEvent(payload: unknown) {
  const p = payload as { type?: string; data?: { email_id?: string; to?: string[] } };
  const eventType = p.type;
  const resendId = p.data?.email_id;
  if (!resendId) {
    logger.warn({ payload }, "resend webhook missing email_id");
    return;
  }
  const email = await prisma.outreachEmail.findFirst({ where: { resendId } });
  if (!email) {
    logger.warn({ resendId }, "resend webhook for unknown email — ignoring");
    return;
  }

  let nextStatus: typeof email.status | null = null;
  let stage: LeadStage | null = null;
  let timestampField: keyof typeof email | null = null;
  switch (eventType) {
    case "email.delivered":
      nextStatus = "DELIVERED"; timestampField = "deliveredAt"; break;
    case "email.opened":
      nextStatus = "OPENED"; timestampField = "openedAt"; stage = "ENGAGED"; break;
    case "email.clicked":
      nextStatus = "CLICKED"; timestampField = "clickedAt"; stage = "ENGAGED"; break;
    case "email.bounced":
      nextStatus = "BOUNCED"; timestampField = "bouncedAt"; stage = "BOUNCED"; break;
    case "email.complained":
      nextStatus = "COMPLAINED"; stage = "UNSUBSCRIBED"; break;
    default:
      logger.info({ eventType, resendId }, "resend webhook event ignored");
      return;
  }

  // Don't downgrade — only escalate (e.g. SENT → DELIVERED → OPENED → CLICKED).
  const order = ["QUEUED", "SUPPRESSED", "FAILED", "SENT", "DELIVERED", "OPENED", "CLICKED", "REPLIED", "BOUNCED", "COMPLAINED"] as const;
  if (order.indexOf(nextStatus) > order.indexOf(email.status)) {
    await prisma.outreachEmail.update({
      where: { id: email.id },
      data: {
        status: nextStatus,
        ...(timestampField ? { [timestampField]: new Date() } : {}),
      },
    });
  }

  if (stage) {
    const lead = await prisma.lead.findUnique({ where: { id: email.leadId } });
    if (lead && lead.stage !== "ONBOARDED" && lead.stage !== stage) {
      await prisma.lead.update({ where: { id: email.leadId }, data: { stage } });
    }
  }
}
