"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, getToken } from "@/lib/api";

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
    <div className="space-y-4">
      <Link href="/admin" className="text-sm text-ink-500 hover:underline">← Admin</Link>
      <h1 className="text-3xl font-bold">Subscriptions</h1>

      <div className="flex gap-2 text-sm">
        <select value={filter} onChange={(e) => setFilter(e.target.value)} className="rounded-lg border border-ink-200 bg-white px-3 py-1.5">
          <option value="">All</option>
          {["TRIALING", "ACTIVE", "PAST_DUE", "CANCELED", "EXPIRED", "PAUSED"].map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>

      {loading ? (
        <p className="text-ink-500">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-ink-500">No subscriptions.</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-ink-200">
          <table className="w-full bg-white text-sm">
            <thead className="bg-ink-50 text-left text-xs uppercase tracking-wide text-ink-500">
              <tr>
                <th className="px-3 py-2">User</th>
                <th className="px-3 py-2">Plan</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Period end</th>
                <th className="px-3 py-2">Last invoice</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((s) => (
                <tr key={s.id} className="border-t border-ink-100">
                  <td className="px-3 py-2 font-mono text-xs">{s.userId.slice(0, 10)}…</td>
                  <td className="px-3 py-2">
                    {s.plan.name}
                    <span className="block text-xs text-ink-500">KES {(s.plan.monthlyKesCents / 100).toLocaleString("en-KE")}/mo</span>
                  </td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[s.status] ?? "bg-ink-100"}`}>{s.status}</span>
                    {s.failedAttempts > 0 && <span className="ml-1 text-xs text-red-600">×{s.failedAttempts}</span>}
                  </td>
                  <td className="px-3 py-2 text-ink-700">{new Date(s.currentPeriodEnd).toLocaleDateString("en-KE")}</td>
                  <td className="px-3 py-2 text-ink-700">{s.invoices[0] ? `${s.invoices[0].status} · ${s.invoices[0].mpesaReceipt ?? "—"}` : "—"}</td>
                  <td className="px-3 py-2">
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
