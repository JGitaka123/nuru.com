/**
 * Viewings — book, confirm, reschedule, complete.
 *
 * Tenants book a slot. Agents confirm (or propose a new time).
 * Day-before SMS reminders are sent by a worker.
 */

import { z } from "zod";
import type { UserRole, ViewingStatus } from "@prisma/client";
import { prisma } from "../db/client";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../lib/errors";
import { sendSms } from "./notifications";
import { toDisplay } from "../lib/phone";
import { logger } from "../lib/logger";
import { viewingReminderQueue } from "../workers/queues";
import { recordEvent } from "./events";

export const BookingInputSchema = z.object({
  listingId: z.string().min(1),
  scheduledAt: z.coerce.date(),
  notes: z.string().max(500).optional(),
});

export async function bookViewing(tenantId: string, input: z.infer<typeof BookingInputSchema>) {
  const data = BookingInputSchema.parse(input);
  if (data.scheduledAt.getTime() < Date.now() + 30 * 60 * 1000) {
    throw new ValidationError("Schedule at least 30 minutes ahead");
  }

  const listing = await prisma.listing.findUnique({
    where: { id: data.listingId },
    include: { agent: { select: { phoneE164: true, name: true } } },
  });
  if (!listing) throw new NotFoundError("Listing");
  if (listing.status !== "ACTIVE") {
    throw new ConflictError(`Listing is ${listing.status}`);
  }

  // Prevent two viewings within 60 min for the same listing+tenant.
  const conflict = await prisma.viewing.findFirst({
    where: {
      listingId: data.listingId,
      tenantId,
      status: { in: ["REQUESTED", "CONFIRMED"] },
      scheduledAt: {
        gte: new Date(data.scheduledAt.getTime() - 60 * 60 * 1000),
        lte: new Date(data.scheduledAt.getTime() + 60 * 60 * 1000),
      },
    },
  });
  if (conflict) throw new ConflictError("You already have a viewing near this time");

  const viewing = await prisma.viewing.create({
    data: {
      listingId: data.listingId,
      tenantId,
      scheduledAt: data.scheduledAt,
      notes: data.notes,
      status: "REQUESTED",
    },
  });

  recordEvent({
    type: "viewing_book",
    actorId: tenantId,
    actorRole: "TENANT",
    targetType: "viewing",
    targetId: viewing.id,
    properties: { listingId: data.listingId },
  });

  // Notify the agent.
  const tenant = await prisma.user.findUniqueOrThrow({ where: { id: tenantId } });
  sendSms(
    listing.agent.phoneE164,
    `Nuru: New viewing request for "${listing.title}" by ${tenant.name ?? toDisplay(tenant.phoneE164)} on ${formatEAT(data.scheduledAt)}. Confirm in the app.`,
  ).catch((e) => logger.error({ err: e }, "agent sms failed"));

  return viewing;
}

export async function confirmViewing(viewingId: string, userId: string, role: UserRole) {
  const v = await loadViewingForAgent(viewingId, userId, role);
  if (v.status !== "REQUESTED") throw new ConflictError(`Cannot confirm a ${v.status} viewing`);

  const updated = await prisma.viewing.update({
    where: { id: viewingId },
    data: { status: "CONFIRMED" },
  });

  sendSms(
    v.tenant.phoneE164,
    `Nuru: Your viewing for "${v.listing.title}" on ${formatEAT(v.scheduledAt)} is confirmed. Reply CANCEL to cancel.`,
  ).catch(() => undefined);

  // Schedule a reminder ~24h before the viewing.
  const reminderDelay = v.scheduledAt.getTime() - Date.now() - 24 * 60 * 60 * 1000;
  if (reminderDelay > 0) {
    await viewingReminderQueue.add(
      "remind",
      { viewingId, channel: "sms" },
      { delay: reminderDelay, jobId: `reminder-${viewingId}` },
    ).catch((e) => logger.warn({ err: e }, "could not enqueue reminder"));
  }

  return updated;
}

export async function rescheduleViewing(
  viewingId: string,
  userId: string,
  role: UserRole,
  newAt: Date,
) {
  if (newAt.getTime() < Date.now() + 30 * 60 * 1000) {
    throw new ValidationError("Schedule at least 30 minutes ahead");
  }
  const v = await loadViewingEither(viewingId, userId, role);
  if (v.status === "COMPLETED" || v.status === "CANCELLED") {
    throw new ConflictError(`Cannot reschedule a ${v.status} viewing`);
  }
  return prisma.viewing.update({
    where: { id: viewingId },
    data: { scheduledAt: newAt, status: "REQUESTED" },
  });
}

export async function setViewingStatus(
  viewingId: string,
  userId: string,
  role: UserRole,
  to: ViewingStatus,
  rating?: number,
) {
  const v = await loadViewingEither(viewingId, userId, role);
  if (rating !== undefined && (rating < 1 || rating > 5)) {
    throw new ValidationError("Rating must be 1-5");
  }
  return prisma.viewing.update({
    where: { id: viewingId },
    data: { status: to, ...(rating !== undefined ? { rating } : {}) },
  });
}

export async function listMyViewings(userId: string, role: UserRole) {
  if (role === "TENANT") {
    return prisma.viewing.findMany({
      where: { tenantId: userId },
      orderBy: { scheduledAt: "desc" },
      include: { listing: { select: { id: true, title: true, neighborhood: true, primaryPhotoKey: true } } },
      take: 50,
    });
  }
  return prisma.viewing.findMany({
    where: { listing: { agentId: userId } },
    orderBy: { scheduledAt: "desc" },
    include: {
      listing: { select: { id: true, title: true } },
      tenant: { select: { id: true, name: true, phoneE164: true } },
    },
    take: 100,
  });
}

async function loadViewingForAgent(viewingId: string, userId: string, role: UserRole) {
  const v = await prisma.viewing.findUnique({
    where: { id: viewingId },
    include: {
      listing: { select: { agentId: true, title: true } },
      tenant: { select: { phoneE164: true, name: true } },
    },
  });
  if (!v) throw new NotFoundError("Viewing");
  if (role !== "ADMIN" && v.listing.agentId !== userId) {
    throw new ForbiddenError("Not your listing");
  }
  return v;
}

async function loadViewingEither(viewingId: string, userId: string, role: UserRole) {
  const v = await prisma.viewing.findUnique({
    where: { id: viewingId },
    include: {
      listing: { select: { agentId: true, title: true } },
      tenant: { select: { phoneE164: true, name: true } },
    },
  });
  if (!v) throw new NotFoundError("Viewing");
  if (role !== "ADMIN" && v.tenantId !== userId && v.listing.agentId !== userId) {
    throw new ForbiddenError("Not your viewing");
  }
  return v;
}

function formatEAT(d: Date): string {
  const eat = new Date(d.getTime() + 3 * 60 * 60 * 1000);
  const date = `${eat.getUTCDate().toString().padStart(2, "0")}/${(eat.getUTCMonth() + 1).toString().padStart(2, "0")}`;
  const time = `${eat.getUTCHours().toString().padStart(2, "0")}:${eat.getUTCMinutes().toString().padStart(2, "0")}`;
  return `${date} ${time} EAT`;
}
