"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, getToken } from "@/lib/api";
import { formatKes } from "@/lib/format";

interface AppRow {
  id: string;
  status: string;
  createdAt: string;
  monthlyIncomeKesCents?: number | null;
  employerName?: string | null;
  aiSummary?: string | null;
  aiRecommendation?: string | null;
  tenant: { id: string; name: string | null; phoneE164: string; verificationStatus: string };
}

const STATUS_BADGE: Record<string, string> = {
  SUBMITTED: "bg-ink-100 text-ink-800",
  UNDER_REVIEW: "bg-amber-100 text-amber-800",
  APPROVED: "bg-green-100 text-green-800",
  REJECTED: "bg-red-100 text-red-800",
  WITHDRAWN: "bg-ink-200 text-ink-700",
};

export default function AgentApplicationsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: listingId } = use(params);
  const router = useRouter();
  const [items, setItems] = useState<AppRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getToken()) {
      router.push("/login");
      return;
    }
    api<{ items: AppRow[] }>(`/v1/listings/${listingId}/applications`)
      .then((r) => setItems(r.items))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [listingId, router]);

  async function decide(appId: string, decision: "APPROVED" | "REJECTED") {
    setBusy(appId);
    setError(null);
    try {
      await api(`/v1/applications/${appId}/decide`, { method: "POST", body: { decision } });
      setItems((prev) => prev.map((a) => (a.id === appId ? { ...a, status: decision } : a)));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <div className="text-ink-500">Loading…</div>;
  if (error) return <div className="rounded-lg bg-red-50 p-4 text-red-700">{error}</div>;

  return (
    <div className="space-y-4">
      <Link href={`/agent/${listingId}`} className="text-sm text-ink-500 hover:underline">← Back to listing</Link>
      <h1 className="text-3xl font-bold">Applications</h1>

      {items.length === 0 ? (
        <p className="text-ink-500">No applications yet.</p>
      ) : (
        <ul className="space-y-3">
          {items.map((a) => (
            <li key={a.id} className="rounded-xl border border-ink-200 bg-white p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-semibold">
                    {a.tenant.name ?? a.tenant.phoneE164}
                    {a.tenant.verificationStatus === "VERIFIED" && (
                      <span className="ml-2 text-xs text-green-700">✓ Verified</span>
                    )}
                  </p>
                  <p className="text-sm text-ink-500">
                    {a.employerName ?? "—"} · {a.monthlyIncomeKesCents ? `${formatKes(a.monthlyIncomeKesCents)}/mo` : "(income not stated)"}
                  </p>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[a.status]}`}>
                  {a.status.replace("_", " ")}
                </span>
              </div>

              {a.aiRecommendation && (
                <div className="mt-3 rounded-lg bg-amber-50 p-3 text-sm">
                  <p>
                    <strong>AI screen:</strong> {a.aiRecommendation}
                  </p>
                  {a.aiSummary && <p className="mt-1 text-ink-700">{a.aiSummary}</p>}
                </div>
              )}

              {(a.status === "SUBMITTED" || a.status === "UNDER_REVIEW") && (
                <div className="mt-3 flex gap-2">
                  <button
                    disabled={busy === a.id}
                    onClick={() => decide(a.id, "APPROVED")}
                    className="rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                  >
                    Approve
                  </button>
                  <button
                    disabled={busy === a.id}
                    onClick={() => decide(a.id, "REJECTED")}
                    className="rounded-lg border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                  >
                    Reject
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
