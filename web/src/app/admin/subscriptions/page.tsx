"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, getToken } from "@/lib/api";
import { PageHeading, AdminNav } from "@/components/ui";

interface SubRow {
  id: string;
  userId: string;
  planTier: string;
  status: string;
  trialEndsAt: string | null;
  currentPeriodEnd: string;
  failedAttempts: number;
  healthScore: number;
  plan: { name: string; monthlyKesCents: number };
  invoices: Array<{ id: string; amountKesCents: number; status: string; mpesaReceipt: string | null }>;
}

const STATUS_BADGE: Record<string, string> = {
  TRIALING: "bg-blue-100 text-blue-800",
  ACTIVE: "bg-green-100 text-green-800",
  PAST_DUE: "bg-amber-100 text-amber-800",
  CANCELED: "bg-ink-100 text-ink-800",
  EXPIRED: "bg-red-100 text-red-800",
  PAUSED: "bg-purple-100 text-purple-800",
};

export default function AdminSubscriptionsPage() {
  const router = useRouter();
  const [items, setItems] = useState<SubRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("");

  useEffect(() => {
    if (!getToken()) { router.push("/login"); return; }
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  async function refresh() {
    setLoading(true);
    try {
      const r = await api<{ items: SubRow[] }>(`/v1/admin/subscriptions${filter ? `?status=${filter}` : ""}`);
      setItems(r.items);
    } finally {
      setLoading(false);
    }
  }

  async function pause(userId: string, paused: boolean) {
    await api(`/v1/admin/subscriptions/${userId}/pause`, { method: "POST", body: { paused } });
    await refresh();
  }

  return (
    <div className="space-y-8">
      <PageHeading eyebrow="Operations" title="Subscriptions" />
      <AdminNav active="/admin/subscriptions" />

      <div className="flex gap-2 text-sm">
        <select value={filter} onChange={(e) => setFilter(e.target.value)} className="rounded-xl border border-ink-200 bg-surface px-3 py-2">
          <option value="">All</option>
          {["TRIALING", "ACTIVE", "PAST_DUE", "CANCELED", "EXPIRED", "PAUSED"].map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>

      {loading ? (
        <p className="text-ink-500">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-ink-500">No subscriptions.</p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-ink-200 shadow-card">
          <table className="w-full bg-surface text-sm">
            <thead className="border-b border-ink-100 text-left text-xs font-medium uppercase tracking-wide text-ink-400">
              <tr>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Plan</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Period end</th>
                <th className="px-4 py-3">Last invoice</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {items.map((s) => (
                <tr key={s.id}>
                  <td className="px-4 py-3 font-mono text-xs">{s.userId.slice(0, 10)}…</td>
                  <td className="px-4 py-3">
                    {s.plan.name}
                    <span className="block text-xs text-ink-500">KES {(s.plan.monthlyKesCents / 100).toLocaleString("en-KE")}/mo</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE[s.status] ?? "bg-ink-100 text-ink-700"}`}>{s.status}</span>
                    {s.failedAttempts > 0 && <span className="ml-1 text-xs text-red-600">×{s.failedAttempts}</span>}
                  </td>
                  <td className="px-4 py-3 text-ink-700">{new Date(s.currentPeriodEnd).toLocaleDateString("en-KE")}</td>
                  <td className="px-4 py-3 text-ink-700">{s.invoices[0] ? `${s.invoices[0].status} · ${s.invoices[0].mpesaReceipt ?? "—"}` : "—"}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => pause(s.userId, s.status !== "PAUSED")}
                      className="text-xs text-ink-600 hover:underline"
                    >
                      {s.status === "PAUSED" ? "Resume" : "Pause"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
