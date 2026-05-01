/**
 * Lead intake + management.
 *
 * Sources:
 *   - Manual entry (admin UI / API)
 *   - CSV upload (admin)
 *   - RSS scaffolding for public sources (Kenya Gazette, bank
 *     foreclosure notices) — see src/workers/lead-discovery.ts
 *
 * Compliance:
 *   - We only ingest leads from public business listings (org-level,
 *     not personal email harvesting).
 *   - Every send checks the SuppressionList.
 *   - Unsubscribe link in every email; one-click endpoint.
 */

import { z } from "zod";
import type { LeadStage, LeadType } from "@prisma/client";
import { prisma } from "../db/client";
import { ConflictError, NotFoundError, ValidationError } from "../lib/errors";

export const LeadInputSchema = z.object({
  type: z.enum(["AUCTIONEER", "BANK", "AGENT_AGENCY", "LANDLORD", "DEVELOPER", "COURT", "OTHER"]),
  organizationName: z.string().min(2).max(200),
  contactName: z.string().max(120).optional(),
  email: z.string().email().optional(),
  phoneE164: z.string().max(20).optional(),
  websiteUrl: z.string().url().max(500).optional(),
  city: z.string().max(100).optional(),
  estimatedListingsCount: z.number().int().min(0).max(1_000_000).optional(),
  signalNotes: z.string().max(2000).optional(),
  source: z.string().min(1).max(100),
  sourceUrl: z.string().url().max(500).optional(),
});

export async function createLead(input: z.infer<typeof LeadInputSchema>) {
  const data = LeadInputSchema.parse(input);
  if (!data.email && !data.phoneE164) {
    throw new ValidationError("Lead must have at least one of: email, phoneE164");
  }
  if (data.email) {
    const existing = await prisma.lead.findUnique({ where: { email: data.email.toLowerCase() } });
    if (existing) throw new ConflictError("A lead with this email already exists");
  }
  return prisma.lead.create({
    data: {
      ...data,
      email: data.email?.toLowerCase(),
      stage: "NEW",
    },
  });
}

export async function bulkImport(rows: Array<z.infer<typeof LeadInputSchema>>) {
  const seen = new Set<string>();
  let created = 0;
  let skipped = 0;
  for (const row of rows) {
    try {
      const parsed = LeadInputSchema.parse(row);
      if (parsed.email) {
        const k = parsed.email.toLowerCase();
        if (seen.has(k)) { skipped++; continue; }
        seen.add(k);
      }
      await createLead(parsed);
      created++;
    } catch {
      skipped++;
    }
  }
  return { created, skipped };
}

export async function listLeads(opts: {
  type?: LeadType;
  stage?: LeadStage;
  city?: string;
  q?: string;
  cursor?: string;
  limit?: number;
}) {
  const limit = Math.min(opts.limit ?? 50, 200);
  const where = {
    ...(opts.type ? { type: opts.type } : {}),
    ...(opts.stage ? { stage: opts.stage } : {}),
    ...(opts.city ? { city: opts.city } : {}),
    ...(opts.q
      ? {
          OR: [
            { organizationName: { contains: opts.q, mode: "insensitive" as const } },
            { contactName: { contains: opts.q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
  const items = await prisma.lead.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    take: limit + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
  });
  const hasMore = items.length > limit;
  return {
    items: hasMore ? items.slice(0, limit) : items,
    nextCursor: hasMore ? items[limit - 1].id : null,
  };
}

export async function setLeadStage(id: string, stage: LeadStage, reason?: string) {
  const lead = await prisma.lead.findUnique({ where: { id } });
  if (!lead) throw new NotFoundError("Lead");
  return prisma.lead.update({
    where: { id },
    data: {
      stage,
      ...(stage === "REJECTED" && reason ? { rejectedReason: reason } : {}),
    },
  });
}

/** Onboard a lead — link the User row created by the lead's signup. */
export async function onboardLead(id: string, userId: string) {
  return prisma.lead.update({
    where: { id },
    data: { stage: "ONBOARDED", onboardedUserId: userId },
  });
}

export async function leadFunnelMetrics() {
  const stages: LeadStage[] = ["NEW", "ENRICHED", "QUALIFIED", "CONTACTED", "ENGAGED", "ONBOARDED", "REJECTED", "UNSUBSCRIBED", "BOUNCED"];
  const counts = await prisma.lead.groupBy({
    by: ["stage"],
    _count: { _all: true },
  });
  const byStage = Object.fromEntries(counts.map((c) => [c.stage, c._count._all]));
  return Object.fromEntries(stages.map((s) => [s, byStage[s] ?? 0]));
}
