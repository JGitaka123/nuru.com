/**
 * Inquiries — tenant DMs an agent about a listing.
 *
 * One inquiry per (listing, tenant). Re-inquiring updates the existing row
 * and bumps `respondedAt` to null. Channel records where the message came
 * from (in-app vs WhatsApp inbound vs SMS reply).
 *
 * The agent sees the inquiry in their CRM. Auto-replies (when enabled) are
 * drafted by `whatsapp-reply.ts` and sent via WhatsApp template OR in-app DM.
 */

import { z } from "zod";
import type { UserRole } from "@prisma/client";
import { prisma } from "../db/client";
import { ConflictError, ForbiddenError, NotFoundError } from "../lib/errors";
import { sendSms } from "./notifications";
import { logger } from "../lib/logger";

export const InquiryInputSchema = z.object({
  listingId: z.string().min(1),
  message: z.string().min(1).max(800).optional(),
  channel: z.enum(["app", "whatsapp", "sms"]).default("app"),
});

export async function createInquiry(tenantId: string, input: z.infer<typeof InquiryInputSchema>) {
  const data = InquiryInputSchema.parse(input);

  const listing = await prisma.listing.findUnique({
    where: { id: data.listingId },
    include: { agent: { select: { id: true, phoneE164: true } } },
  });
  if (!listing) throw new NotFoundError("Listing");
  if (listing.status !== "ACTIVE") throw new ConflictError(`Listing is ${listing.status}`);
  if (listing.agentId === tenantId) throw new ConflictError("You can't inquire on your own listing");

  // One inquiry per (listing, tenant).
  const existing = await prisma.inquiry.findFirst({
    where: { listingId: data.listingId, tenantId },
  });
  const inquiry = existing
    ? await prisma.inquiry.update({
        where: { id: existing.id },
        data: { message: data.message, channel: data.channel, respondedAt: null },
      })
    : await prisma.inquiry.create({
        data: { listingId: data.listingId, tenantId, message: data.message, channel: data.channel },
      });

  // Notify the agent.
  sendSms(
    listing.agent.phoneE164,
    `Nuru: New inquiry on "${listing.title.slice(0, 40)}". Reply in the app: nuru.com/agent`,
  ).catch((e) => logger.warn({ err: e }, "agent sms failed"));

  return inquiry;
}

export async function listInquiriesForListing(listingId: string, agentId: string, role: UserRole) {
  const listing = await prisma.listing.findUnique({ where: { id: listingId } });
  if (!listing) throw new NotFoundError("Listing");
  if (listing.agentId !== agentId && role !== "ADMIN") {
    throw new ForbiddenError("Not your listing");
  }
  return prisma.inquiry.findMany({
    where: { listingId },
    orderBy: { createdAt: "desc" },
    include: { tenant: { select: { id: true, name: true, phoneE164: true } } },
    take: 200,
  });
}

export async function listInquiriesForAgent(agentId: string) {
  return prisma.inquiry.findMany({
    where: { listing: { agentId } },
    orderBy: { createdAt: "desc" },
    include: {
      listing: { select: { id: true, title: true, primaryPhotoKey: true } },
      tenant: { select: { id: true, name: true, phoneE164: true } },
    },
    take: 200,
  });
}

export async function markResponded(inquiryId: string, agentId: string, role: UserRole) {
  const i = await prisma.inquiry.findUnique({
    where: { id: inquiryId },
    include: { listing: true },
  });
  if (!i) throw new NotFoundError("Inquiry");
  if (i.listing.agentId !== agentId && role !== "ADMIN") {
    throw new ForbiddenError("Not your inquiry");
  }
  return prisma.inquiry.update({
    where: { id: inquiryId },
    data: { respondedAt: new Date() },
  });
}
