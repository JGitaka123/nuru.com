"use client";

import { use, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, getToken } from "@/lib/api";
import { toast } from "@/components/Toast";

interface Msg {
  id: string;
  senderId: string;
  body: string;
  createdAt: string;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

export default function MessageThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [me, setMe] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!getToken()) { router.push(`/login?next=/messages/${id}`); return; }
    Promise.all([
      api<{ items: Msg[] }>(`/v1/conversations/${id}/messages?limit=100`),
      api<{ id: string }>("/v1/auth/me"),
    ])
      .then(([m, u]) => {
        setMessages([...m.items].reverse());
        setMe(u.id);
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "auto" }), 0);
        api(`/v1/conversations/${id}/read`, { method: "POST" }).catch(() => undefined);
      })
      .catch(() => undefined);
  }, [id, router]);

  // Subscribe to SSE stream for live updates.
  useEffect(() => {
    const token = getToken();
    if (!token) return;
    const url = `${API_BASE}/v1/conversations/${id}/stream`;
    // EventSource doesn't allow custom headers; pass token in querystring.
    // (For production: use fetch+ReadableStream or a small wrapper.)
    const es = new EventSource(`${url}?_t=${encodeURIComponent(token)}`);
    es.addEventListener("message", (ev) => {
      try {
        const e = JSON.parse((ev as MessageEvent).data) as { message: Msg };
        if (!e.message) return;
        setMessages((prev) => prev.some((m) => m.id === e.message.id) ? prev : [...prev, e.message]);
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
      } catch { /* noop */ }
    });
    es.onerror = () => { /* let browser auto-reconnect */ };
    return () => es.close();
  }, [id]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setSending(true);
    try {
      const m = await api<Msg>(`/v1/conversations/${id}/messages`, {
        method: "POST",
        body: { body: body.trim() },
      });
      setMessages((prev) => [...prev, m]);
      setBody("");
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't send");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex h-[70vh] flex-col rounded-xl bg-white ring-1 ring-ink-200">
      <div className="flex-1 space-y-2 overflow-y-auto p-4">
        {messages.map((m) => {
          const mine = m.senderId === me;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${mine ? "bg-brand-500 text-white" : "bg-ink-100 text-ink-900"}`}>
                <p className="whitespace-pre-wrap">{m.body}</p>
                <p className={`mt-0.5 text-[10px] ${mine ? "text-brand-100" : "text-ink-500"}`}>
                  {new Date(m.createdAt).toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
      <form onSubmit={send} className="flex gap-2 border-t border-ink-100 p-3">
        <input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Type a message…"
          className="flex-1 rounded-lg border border-ink-200 px-3 py-2"
          autoFocus
        />
        <button disabled={sending || !body.trim()} className="rounded-lg bg-brand-500 px-4 py-2 font-semibold text-white hover:bg-brand-600 disabled:opacity-50">
          {sending ? "Sending…" : "Send"}
        </button>
      </form>
    </div>
  );
}
