/**
 * WhatsApp inbound autoreply worker.
 *
 * Webhooks stay fast and only enqueue verified inbound messages. This worker
 * records the tenant message against the latest conversation for that phone
 * number, drafts a reply, and auto-sends only when the agent has the
 * whatsappAutoreply feature and the draft is safe for automation.
 */

import { Worker as BullWorker } from "bullmq";
import { prisma } from "../db/client";
import { logger } from "../lib/logger";
import { draftWhatsAppReply } from "../prompts/whatsapp-reply";
import { feature } from "../services/subscriptions";
import { sendText } from "../services/whatsapp";
import { recordEvent } from "../services/events";
import { redis, type WhatsAppReplyJob } from "./queues";

export function startWhatsAppReplyWorker() {
  const worker = new BullWorker<WhatsAppReplyJob>(
    "whatsapp-replies",
    async (job) => processInbound(job.data),
    { connection: redis, concurrency: 2 },
  );
  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err }, "whatsapp reply worker failed");
  });
  return worker;
}

async function processInbound(job: WhatsAppReplyJob) {
  const tenant = await prisma.user.findUnique({
    where: { phoneE164: job.fromE164 },
    select: { id: true },
  });
  if (!tenant) {
    logger.info({ from: "[redacted]" }, "whatsapp inbound from unknown phone");
    return;
  }

  const conversation = await prisma.conversation.findFirst({
    where: { tenantId: tenant.id, listingId: { not: null }, archivedByTenant: false },
    orderBy: { lastMessageAt: "desc" },
  });
  if (!conversation?.listingId) {
    logger.info({ tenantId: tenant.id }, "whatsapp inbound has no listing conversation");
    return;
  }

  const listing = await prisma.listing.findUnique({
    where: { id: conversation.listingId },
    select: {
      id: true,
      title: true,
      neighborhood: true,
      rentKesCents: true,
      bedrooms: true,
      features: true,
      status: true,
      agentId: true,
      agent: { select: { name: true } },
    },
  });
  if (!listing || listing.status !== "ACTIVE") {
    logger.info({ conversationId: conversation.id }, "whatsapp inbound listing unavailable");
    return;
  }

  const duplicate = await prisma.message.findFirst({
    where: {
      conversationId: conversation.id,
      senderId: tenant.id,
      body: job.text,
      createdAt: { gte: new Date(Date.now() - 5 * 60_000) },
    },
    select: { id: true },
  });
  if (!duplicate) {
    const inboundAt = new Date(job.timestamp);
    const message = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        senderId: tenant.id,
        body: job.text,
        createdAt: Number.isNaN(inboundAt.getTime()) ? new Date() : inboundAt,
      },
    });
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: message.createdAt, archivedByAgent: false },
    });
  }

  const recent = await prisma.message.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  const draft = await draftWhatsAppReply({
    tenantMessage: job.text,
    listing: {
      id: listing.id,
      title: listing.title,
      neighborhood: listing.neighborhood,
      rentKes: Math.round(listing.rentKesCents / 100),
      bedrooms: listing.bedrooms,
      features: listing.features,
    },
    agentName: listing.agent.name ?? "Nuru agent",
    history: recent.reverse().map((m) => ({
      from: m.senderId === tenant.id ? "tenant" : "agent",
      text: m.body,
    })),
  });

  const canAutoSend = await feature(listing.agentId, "whatsappAutoreply");
  if (draft.content.needsAgentReview || !canAutoSend) {
    logger.info({
      conversationId: conversation.id,
      needsAgentReview: draft.content.needsAgentReview,
      canAutoSend,
      reason: draft.content.reviewReason,
    }, "whatsapp draft held for agent review");
    return;
  }

  await sendText(job.fromE164, draft.content.reply);
  const outbound = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      senderId: listing.agentId,
      body: draft.content.reply,
      aiSuggestion: true,
    },
  });
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: outbound.createdAt },
  });

  recordEvent({
    type: "inquiry_submit",
    actorId: listing.agentId,
    targetType: "conversation",
    targetId: conversation.id,
    properties: { kind: "whatsapp_autoreply", listingId: listing.id },
  });
}
