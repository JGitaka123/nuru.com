"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, getToken } from "@/lib/api";
import { photoUrl } from "@/lib/format";

interface ConvRow {
  id: string;
  listingId: string | null;
  lastMessageAt: string;
  lastReadByTenant: string | null;
  lastReadByAgent: string | null;
  tenant: { id: string; name: string | null; phoneE164: string };
  agent: { id: string; name: string | null; phoneE164: string };
  messages: Array<{ id: string; body: string; senderId: string; createdAt: string }>;
}

export default function MessagesPage() {
  const router = useRouter();
  const [items, setItems] = useState<ConvRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getToken()) { router.push("/login?next=/messages"); return; }
    api<{ items: ConvRow[] }>("/v1/conversations")
      .then((r) => setItems(r.items))
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [router]);

  if (loading) return <div className="text-ink-500">Loading…</div>;

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold">Messages</h1>
      {items.length === 0 ? (
        <p className="text-ink-500">No conversations yet. Open a listing and tap "Chat with agent".</p>
      ) : (
        <ul className="divide-y divide-ink-100 overflow-hidden rounded-xl bg-white ring-1 ring-ink-200">
          {items.map((c) => {
            const last = c.messages[0];
            return (
              <li key={c.id}>
                <Link href={`/messages/${c.id}`} className="flex items-center gap-3 p-4 hover:bg-ink-50">
                  <div className="h-10 w-10 flex-none rounded-full bg-brand-200 text-center font-bold text-brand-800 leading-10">
                    {(c.tenant.name ?? c.agent.name ?? "N").charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{c.tenant.name ?? c.tenant.phoneE164} ↔ {c.agent.name ?? c.agent.phoneE164}</p>
                    <p className="truncate text-sm text-ink-600">{last?.body ?? "(no messages yet)"}</p>
                  </div>
                  <p className="flex-none text-xs text-ink-500">
                    {new Date(c.lastMessageAt).toLocaleString("en-KE", { timeZone: "Africa/Nairobi", dateStyle: "short", timeStyle: "short" })}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
