"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, getToken } from "@/lib/api";
import { toast } from "@/components/Toast";

interface Task {
  id: string;
  userId: string;
  kind: string;
  status: string;
  dueAt: string;
  priority: number;
  aiDraft?: {
    smsBody?: string;
    emailSubject?: string;
    emailBody?: string;
    primaryCta?: string;
    primaryCtaUrl?: string;
    confidence?: number;
    notes?: string;
    recommendedTier?: string | null;
  } | null;
  aiConfidence: number | null;
  channelsTried: string[];
  resultNote: string | null;
}

const STATUS_BADGE: Record<string, string> = {
  PENDING: "bg-ink-100 text-ink-800",
  IN_PROGRESS: "bg-blue-100 text-blue-800",
  REVIEW_NEEDED: "bg-amber-100 text-amber-800",
  COMPLETED: "bg-green-100 text-green-800",
  CANCELED: "bg-red-100 text-red-800",
};

export default function AdminAgentTasksPage() {
  const router = useRouter();
  const [items, setItems] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("REVIEW_NEEDED");

  useEffect(() => {
    if (!getToken()) { router.push("/login"); return; }
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  async function refresh() {
    setLoading(true);
    try {
      const r = await api<{ items: Task[] }>(`/v1/admin/agent-tasks?status=${statusFilter}`);
      setItems(r.items);
    } finally {
      setLoading(false);
    }
  }

  async function approve(t: Task) {
    try {
      await api(`/v1/admin/agent-tasks/${t.id}/approve`, { method: "POST" });
      toast.success("Approved — will send shortly");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }

  async function cancel(t: Task) {
    await api(`/v1/admin/agent-tasks/${t.id}/cancel`, { method: "POST" });
    setItems((prev) => prev.filter((x) => x.id !== t.id));
  }

  return (
    <div className="space-y-4">
      <Link href="/admin" className="text-sm text-ink-500 hover:underline">← Admin</Link>
      <h1 className="text-3xl font-bold">Autonomous CRM tasks</h1>
      <p className="text-ink-600">AI-drafted client-success messages awaiting human review (low-confidence) or already executed.</p>

      <div className="flex gap-2 text-sm">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-lg border border-ink-200 bg-white px-3 py-1.5">
          {["REVIEW_NEEDED", "PENDING", "COMPLETED", "CANCELED"].map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>

      {loading ? (
        <p className="text-ink-500">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-ink-500">No tasks in this state.</p>
      ) : (
        <ul className="space-y-3">
          {items.map((t) => (
            <li key={t.id} className="rounded-xl border border-ink-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold">{t.kind.replace(/_/g, " ").toLowerCase()}</p>
                  <p className="text-xs text-ink-500">User {t.userId.slice(0, 10)}… · priority {t.priority}{t.aiConfidence !== null ? ` · confidence ${(t.aiConfidence * 100).toFixed(0)}%` : ""}</p>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[t.status]}`}>{t.status}</span>
              </div>

              {t.aiDraft && (
                <div className="mt-3 space-y-2 rounded-lg bg-ink-50 p-3 text-sm">
                  {t.aiDraft.emailSubject && (
                    <p><strong>Email subject:</strong> {t.aiDraft.emailSubject}</p>
                  )}
                  {t.aiDraft.emailBody && (
                    <details>
                      <summary className="cursor-pointer text-ink-600">Email body</summary>
                      <pre className="mt-1 whitespace-pre-wrap text-xs">{t.aiDraft.emailBody}</pre>
                    </details>
                  )}
                  {t.aiDraft.smsBody && (
                    <p><strong>SMS:</strong> {t.aiDraft.smsBody}</p>
                  )}
                  {t.aiDraft.recommendedTier && <p className="text-xs text-ink-500">Recommended tier: {t.aiDraft.recommendedTier}</p>}
                  {t.aiDraft.notes && <p className="text-xs text-ink-500">Notes: {t.aiDraft.notes}</p>}
                </div>
              )}

              {t.resultNote && (
                <p className="mt-2 text-xs text-ink-500">Result: {t.resultNote}</p>
              )}
              {t.channelsTried.length > 0 && (
                <p className="mt-1 text-xs text-ink-500">Sent via: {t.channelsTried.join(", ")}</p>
              )}

              {t.status === "REVIEW_NEEDED" && (
                <div className="mt-3 flex gap-2">
                  <button onClick={() => approve(t)} className="rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-600">Approve & send</button>
                  <button onClick={() => cancel(t)} className="rounded-lg border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50">Cancel</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
