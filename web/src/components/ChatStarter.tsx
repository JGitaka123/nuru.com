"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, getToken } from "@/lib/api";
import { toast } from "@/components/Toast";

export default function ChatStarter({ listingId }: { listingId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function start() {
    if (!getToken()) {
      router.push(`/login?next=/listing/${listingId}`);
      return;
    }
    setBusy(true);
    try {
      const c = await api<{ id: string }>("/v1/conversations", {
        method: "POST",
        body: { listingId },
      });
      router.push(`/messages/${c.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't start chat");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={start}
      disabled={busy}
      className="block w-full rounded-lg border border-ink-300 py-3 text-center font-medium hover:bg-ink-50 disabled:opacity-50"
    >
      {busy ? "Opening…" : "Chat with agent"}
    </button>
  );
}
