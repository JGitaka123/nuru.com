import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  conversation: {
    findMany: vi.fn(),
  },
  user: {
    findMany: vi.fn(),
  },
}));

vi.mock("../db/client", () => ({ prisma: prismaMock }));
vi.mock("./events", () => ({ recordEvent: vi.fn() }));
vi.mock("./notifications", () => ({ sendSms: vi.fn() }));

import { listForUser } from "./conversations";

describe("listForUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("hydrates tenant and agent summaries without relying on Prisma relation includes", async () => {
    const createdAt = new Date("2026-07-08T08:00:00.000Z");
    const lastMessageAt = new Date("2026-07-08T08:05:00.000Z");

    prismaMock.conversation.findMany.mockResolvedValue([
      {
        id: "conversation-1",
        listingId: "listing-1",
        tenantId: "tenant-1",
        agentId: "agent-1",
        lastMessageAt,
        lastReadByTenant: null,
        lastReadByAgent: null,
        archivedByTenant: false,
        archivedByAgent: false,
        createdAt,
        messages: [
          {
            id: "message-1",
            conversationId: "conversation-1",
            senderId: "tenant-1",
            body: "Is this still available?",
            attachmentKeys: [],
            aiSuggestion: false,
            createdAt: lastMessageAt,
          },
        ],
      },
    ]);
    prismaMock.user.findMany.mockResolvedValue([
      { id: "tenant-1", name: "Tenant One", phoneE164: "+254700000001" },
      { id: "agent-1", name: "Agent One", phoneE164: "+254700000002" },
    ]);

    const result = await listForUser("agent-1", "AGENT");

    expect(prismaMock.conversation.findMany).toHaveBeenCalledWith({
      where: { agentId: "agent-1", archivedByAgent: false },
      orderBy: { lastMessageAt: "desc" },
      take: 100,
      include: {
        messages: { take: 1, orderBy: { createdAt: "desc" } },
      },
    });
    expect(prismaMock.user.findMany).toHaveBeenCalledWith({
      where: { id: { in: ["tenant-1", "agent-1"] } },
      select: { id: true, name: true, phoneE164: true },
    });
    expect(result[0]?.tenant).toEqual({ id: "tenant-1", name: "Tenant One", phoneE164: "+254700000001" });
    expect(result[0]?.agent).toEqual({ id: "agent-1", name: "Agent One", phoneE164: "+254700000002" });
  });
});
