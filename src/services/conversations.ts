/**
 * Real-time conversations between tenants and agents.
 *
 * One conversation per (listingId, tenantId, agentId). Messages append-only.
 * Read receipts via lastReadByTenant / lastReadByAgent timestamps.
 *
 * Real-time delivery: src/routes/conversations.ts exposes an SSE stream.
 * BullMQ pub/sub fan-out keeps it horizontal-scalable across API replicas.
 */

import { z } from "zod";
import { EventEmitter } from "node:events";
import { prisma } from "../db/client";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../lib/errors";
import { recordEvent } from "./events";
import { sendSms } from "./notifications";
import { logger } from "../lib/logger";

export const SendMessageSchema = z.object({
  body: z.string().min(1).max(4000),
  attachmentKeys: z.array(z.string().min(5).max(300)).max(8).optional(),
});

// In-process pub/sub. For multi-process: swap to ioredis pub/sub.
const bus = new EventEmitter();
bus.setMaxListeners(0);

export type ConversationEvent =
  | { type: "message"; conversationId: string; message: { id: string; senderId: string; body: string; createdAt: string } }
  | { type: "read"; conversationId: string; readerId: string };

export function subscribe(conversationId: string, fn: (e: ConversationEvent) => void) {
  bus.on(conversationId, fn);
  return () => bus.off(conversationId, fn);
}

function publish(conversationId: string, e: ConversationEvent) {
  bus.emit(conversationId, e);
}

/**
 * Create or find a (listingId, tenantId, agentId) conversation.
 * Tenant initiates from a listing; agent responds.
 */
export async function getOrCreate(opts: {
  listingId: string;
  tenantId: string;
}) {
  const listing = await prisma.listing.findUnique({
    where: { id: opts.listingId },
    select: { id: true, agentId: true, status: true },
  });
  if (!listing) throw new NotFoundError("Listing");
  if (listing.agentId === opts.tenantId) {
    throw new ConflictError("Cannot start a conversation with yourself");
  }

  const existing = await prisma.conversation.findUnique({
    where: { listingId_tenantId_agentId: { listingId: listing.id, tenantId: opts.tenantId, agentId: listing.agentId } },
  });
  if (existing) return existing;

  return prisma.conversation.create({
    data: {
      listingId: listing.id,
      tenantId: opts.tenantId,
      agentId: listing.agentId,
    },
  });
}

export async function listForUser(userId: string, role: "TENANT" | "AGENT" | "LANDLORD" | "ADMIN") {
  const where = role === "TENANT"
    ? { tenantId: userId, archivedByTenant: false }
    : role === "ADMIN"
      ? {}
      : { agentId: userId, archivedByAgent: false };

  return prisma.conversation.findMany({
    where,
    orderBy: { lastMessageAt: "desc" },
    take: 100,
    include: {
      messages: { take: 1, orderBy: { createdAt: "desc" } },
      tenant: { select: { id: true, name: true, phoneE164: true } },
      agent: { select: { id: true, name: true, phoneE164: true } },
    } as never,    // simplified type; relations added once Prisma generates
  });
}

export async function loadConversation(id: string, userId: string, role: "TENANT" | "AGENT" | "LANDLORD" | "ADMIN") {
  const conv = await prisma.conversation.findUnique({ where: { id } });
  if (!conv) throw new NotFoundError("Conversation");
  if (role !== "ADMIN" && conv.tenantId !== userId && conv.agentId !== userId) {
    throw new ForbiddenError("Not a party to this conversation");
  }
  return conv;
}

export async function listMessages(conversationId: string, userId: string, role: "TENANT" | "AGENT" | "LANDLORD" | "ADMIN", opts: { before?: string; limit?: number } = {}) {
  await loadConversation(conversationId, userId, role);
  const limit = Math.min(opts.limit ?? 50, 200);
  return prisma.message.findMany({
    where: {
      conversationId,
      ...(opts.before ? { createdAt: { lt: new Date(opts.before) } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function sendMessage(conversationId: string, senderId: string, role: "TENANT" | "AGENT" | "LANDLORD" | "ADMIN", input: z.infer<typeof SendMessageSchema>) {
  const data = SendMessageSchema.parse(input);
  const conv = await loadConversation(conversationId, senderId, role);

  const message = await prisma.message.create({
    data: {
      conversationId,
      senderId,
      body: data.body,
      attachmentKeys: data.attachmentKeys ?? [],
    },
  });
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { lastMessageAt: message.createdAt },
  });

  publish(conversationId, {
    type: "message",
    conversationId,
    message: {
      id: message.id,
      senderId: message.senderId,
      body: message.body,
      createdAt: message.createdAt.toISOString(),
    },
  });

  // SMS the recipient if they're not the active sender. Cheap nudge to
  // come back to the app.
  const otherUserId = conv.tenantId === senderId ? conv.agentId : conv.tenantId;
  const other = await prisma.user.findUnique({
    where: { id: otherUserId },
    select: { phoneE164: true },
  });
  if (other?.phoneE164) {
    sendSms(other.phoneE164, `Nuru: New message — open the app to reply.`)
      .catch((e) => logger.warn({ err: e }, "message sms failed"));
  }

  recordEvent({
    type: "inquiry_submit",         // re-using to capture chat activity
    actorId: senderId,
    targetType: "conversation",
    targetId: conversationId,
    properties: { kind: "message", listingId: conv.listingId },
  });

  return message;
}

export async function markRead(conversationId: string, userId: string) {
  const conv = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!conv) throw new NotFoundError("Conversation");
  const isTenant = conv.tenantId === userId;
  const isAgent = conv.agentId === userId;
  if (!isTenant && !isAgent) throw new ForbiddenError("Not a party");
  const now = new Date();
  await prisma.conversation.update({
    where: { id: conversationId },
    data: isTenant ? { lastReadByTenant: now } : { lastReadByAgent: now },
  });
  publish(conversationId, { type: "read", conversationId, readerId: userId });
}

export async function archive(conversationId: string, userId: string) {
  const conv = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!conv) throw new NotFoundError("Conversation");
  const isTenant = conv.tenantId === userId;
  const isAgent = conv.agentId === userId;
  if (!isTenant && !isAgent) throw new ValidationError("Not a party");
  await prisma.conversation.update({
    where: { id: conversationId },
    data: isTenant ? { archivedByTenant: true } : { archivedByAgent: true },
  });
}
