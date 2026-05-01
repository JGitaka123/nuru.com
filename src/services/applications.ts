/**
 * Applications — tenant submits financials + references for a listing.
 *
 * Lifecycle:
 *   SUBMITTED → UNDER_REVIEW (auto, when AI screen runs)
 *   UNDER_REVIEW → APPROVED → triggers Lease creation (PENDING_DEPOSIT)
 *   UNDER_REVIEW → REJECTED
 *   any → WITHDRAWN (tenant)
 *
 * Authorization: tenant owns their applications; agent owns the listing
 * applications for listings they posted. AI screening runs at submit time
 * if the tenant has provided enough data; otherwise stays SUBMITTED.
 */

import { z } from "zod";
import type { UserRole } from "@prisma/client";
import { prisma } from "../db/client";
import { ConflictError, ForbiddenError, NotFoundError } from "../lib/errors";
import { screenTenant, type ApplicationData } from "../prompts/tenant-screener";
import { logger } from "../lib/logger";
import { recordEvent } from "./events";

export const ApplicationInputSchema = z.object({
  listingId: z.string().min(1),
  employerName: z.string().max(200).optional(),
  monthlyIncomeKesCents: z.number().int().min(0).max(1_000_000_000).optional(),
  references: z.array(z.object({
    name: z.string().min(2).max(100),
    phone: z.string().min(7).max(20),
    relationship: z.string().min(2).max(50),
  })).max(5).optional(),
  documents: z.array(z.object({
    type: z.enum(["paystub", "id", "bank_statement", "employment_letter", "other"]),
    r2Key: z.string().min(5),
  })).max(10).optional(),
});

export async function submitApplication(tenantId: string, input: z.infer<typeof ApplicationInputSchema>) {
  const data = ApplicationInputSchema.parse(input);

  const listing = await prisma.listing.findUnique({ where: { id: data.listingId } });
  if (!listing) throw new NotFoundError("Listing");
  if (listing.status !== "ACTIVE") throw new ConflictError(`Listing is ${listing.status}`);
  if (listing.agentId === tenantId) throw new ConflictError("You can't apply to your own listing");

  const existing = await prisma.application.findFirst({
    where: { listingId: data.listingId, tenantId, status: { in: ["SUBMITTED", "UNDER_REVIEW", "APPROVED"] } },
  });
  if (existing) throw new ConflictError("You already have an active application for this listing");

  const application = await prisma.application.create({
    data: {
      listingId: data.listingId,
      tenantId,
      employerName: data.employerName,
      monthlyIncomeKesCents: data.monthlyIncomeKesCents,
      references: data.references ?? null,
      documents: data.documents ?? null,
      status: "SUBMITTED",
    },
  });

  recordEvent({
    type: "application_submit",
    actorId: tenantId,
    actorRole: "TENANT",
    targetType: "application",
    targetId: application.id,
    properties: {
      listingId: data.listingId,
      hasIncome: !!data.monthlyIncomeKesCents,
      refsCount: data.references?.length ?? 0,
    },
  });

  // Kick off AI screening if we have enough signal — non-blocking.
  if (data.monthlyIncomeKesCents && (data.references?.length ?? 0) > 0) {
    runScreen(application.id, listing.rentKesCents).catch((e) =>
      logger.error({ err: e, applicationId: application.id }, "screen failed"),
    );
  }

  return application;
}

async function runScreen(applicationId: string, rentKesCents: number) {
  const app = await prisma.application.findUniqueOrThrow({
    where: { id: applicationId },
    include: { tenant: { include: { leasesAsTenant: true } } },
  });

  const refs = (app.references as Array<{ name: string; phone: string; relationship: string }> | null) ?? [];
  const data: ApplicationData = {
    tenantName: app.tenant.name ?? "Anonymous",
    tenantAge: 30, // not collected explicitly — use safe default; never used for decisions
    employerName: app.employerName ?? null,
    employmentDurationMonths: null,
    monthlyIncomeKes: app.monthlyIncomeKesCents ? Math.round(app.monthlyIncomeKesCents / 100) : null,
    rentToIncomeRatio: app.monthlyIncomeKesCents
      ? rentKesCents / app.monthlyIncomeKesCents
      : null,
    references: refs.map((r) => ({ name: r.name, relationship: r.relationship, verified: false })),
    previousLandlordRating: null,
    hasPaystubs: ((app.documents as Array<{ type: string }> | null) ?? []).some((d) => d.type === "paystub"),
    hasIdVerified: app.tenant.verificationStatus === "VERIFIED",
    yearsRentingOnNuru: app.tenant.leasesAsTenant.length > 0
      ? Math.max(1, Math.floor((Date.now() - app.tenant.createdAt.getTime()) / (365 * 86_400_000)))
      : 0,
    prevLeaseDisputes: app.tenant.leasesAsTenant.filter((l) => l.status === "DISPUTED").length,
  };

  const screen = await screenTenant(data);
  await prisma.application.update({
    where: { id: applicationId },
    data: {
      aiSummary: screen.content.summary,
      aiRecommendation: screen.content.recommendation,
      status: "UNDER_REVIEW",
    },
  });
  logger.info({ applicationId, recommendation: screen.content.recommendation }, "applicant screened");
}

async function loadApplicationOrThrow(id: string) {
  const app = await prisma.application.findUnique({
    where: { id },
    include: {
      listing: { select: { id: true, agentId: true, title: true, rentKesCents: true, depositMonths: true } },
      tenant: { select: { id: true, name: true } },
    },
  });
  if (!app) throw new NotFoundError("Application");
  return app;
}

export async function decideApplication(
  applicationId: string,
  agentId: string,
  role: UserRole,
  decision: "APPROVED" | "REJECTED",
) {
  const app = await loadApplicationOrThrow(applicationId);
  if (app.listing.agentId !== agentId && role !== "ADMIN") {
    throw new ForbiddenError("Not your listing");
  }
  if (app.status === "APPROVED" || app.status === "REJECTED" || app.status === "WITHDRAWN") {
    throw new ConflictError(`Application already ${app.status}`);
  }

  if (decision === "REJECTED") {
    const updated = await prisma.application.update({
      where: { id: applicationId },
      data: { status: "REJECTED", decidedAt: new Date() },
    });
    recordEvent({
      type: "application_decided",
      actorId: agentId, actorRole: "AGENT",
      targetType: "application", targetId: applicationId,
      properties: { decision: "REJECTED", listingId: app.listing.id },
    });
    return updated;
  }

  // Approval triggers Lease creation in PENDING_DEPOSIT state.
  const startDate = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.application.update({
      where: { id: applicationId },
      data: { status: "APPROVED", decidedAt: new Date() },
    });
    const depositKesCents = app.listing.rentKesCents * app.listing.depositMonths;
    await tx.lease.create({
      data: {
        listingId: app.listing.id,
        applicationId: app.id,
        tenantId: app.tenantId,
        landlordId: app.listing.agentId,
        startDate,
        rentKesCents: app.listing.rentKesCents,
        depositKesCents,
        status: "PENDING_DEPOSIT",
      },
    });
    return u;
  });
  recordEvent({
    type: "application_decided",
    actorId: agentId, actorRole: "AGENT",
    targetType: "application", targetId: applicationId,
    properties: { decision: "APPROVED", listingId: app.listing.id },
  });
  return updated;
}

export async function withdrawApplication(applicationId: string, tenantId: string) {
  const app = await loadApplicationOrThrow(applicationId);
  if (app.tenantId !== tenantId) throw new ForbiddenError("Not your application");
  if (app.status === "APPROVED" || app.status === "REJECTED" || app.status === "WITHDRAWN") {
    throw new ConflictError(`Application is ${app.status}`);
  }
  return prisma.application.update({
    where: { id: applicationId },
    data: { status: "WITHDRAWN", decidedAt: new Date() },
  });
}

export async function listApplicationsForListing(listingId: string, agentId: string, role: UserRole) {
  const listing = await prisma.listing.findUnique({ where: { id: listingId } });
  if (!listing) throw new NotFoundError("Listing");
  if (listing.agentId !== agentId && role !== "ADMIN") {
    throw new ForbiddenError("Not your listing");
  }
  return prisma.application.findMany({
    where: { listingId },
    orderBy: { createdAt: "desc" },
    include: {
      tenant: { select: { id: true, name: true, phoneE164: true, verificationStatus: true } },
    },
    take: 200,
  });
}

export async function listApplicationsForTenant(tenantId: string) {
  return prisma.application.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
    include: {
      listing: { select: { id: true, title: true, primaryPhotoKey: true, rentKesCents: true } },
      lease: true,
    },
    take: 100,
  });
}

export async function getApplication(id: string, userId: string, role: UserRole) {
  const app = await loadApplicationOrThrow(id);
  if (
    app.tenantId !== userId &&
    app.listing.agentId !== userId &&
    role !== "ADMIN"
  ) {
    throw new ForbiddenError("Not a party to this application");
  }
  return prisma.application.findUniqueOrThrow({
    where: { id },
    include: {
      listing: true,
      tenant: { select: { id: true, name: true, phoneE164: true, verificationStatus: true } },
      lease: true,
    },
  });
}

/** Re-screen an application after the tenant adds new info (e.g. paystub upload). */
export async function rescreenApplication(applicationId: string, byUserId: string, role: UserRole) {
  const app = await loadApplicationOrThrow(applicationId);
  if (
    app.tenantId !== byUserId &&
    app.listing.agentId !== byUserId &&
    role !== "ADMIN"
  ) {
    throw new ForbiddenError();
  }
  await runScreen(applicationId, app.listing.rentKesCents);
  return getApplication(applicationId, byUserId, role);
}
