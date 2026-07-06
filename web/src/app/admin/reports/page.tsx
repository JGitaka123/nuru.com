"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, getToken } from "@/lib/api";
import { toast } from "@/components/Toast";

interface FraudReport {
  id: string;
  reason: string;
  details?: string | null;
  createdAt: string;
  listing?: {
    id: string;
    title: string;
    agentId: string;
    fraudScore: number;
  } | null;
  reporter: {
    id: string;
    name: string | null;
    phoneE164: string;
  };
}

export default function AdminReportsPage() {
  const router = useRouter();
  const [items, setItems] = useState<FraudReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getToken()) {
      router.push("/login");
      return;
    }
    fetchReports();
  }, [router]);

  async function fetchReports() {
    setLoading(true);
    setError(null);
    try {
      const r = await api<{ items: FraudReport[] }>("/v1/admin/reports");
      setItems(r.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load reports");
    } finally {
      setLoading(false);
    }
  }

  async function resolve(id: string) {
    setBusy(id);
    try {
      await api(`/v1/admin/reports/${id}/resolve`, { method: "POST" });
      setItems((prev) => prev.filter((item) => item.id !== id));
      toast.success("Report resolved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not resolve report");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <Link href="/admin" className="text-sm text-ink-500 hover:underline">&lt;- Admin</Link>
      <div>
        <h1 className="text-3xl font-bold">Fraud reports</h1>
        <p className="text-ink-600">Open reports from tenants and agents.</p>
      </div>

      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {loading ? (
        <p className="text-ink-500">Loading...</p>
      ) : items.length === 0 ? (
        <p className="text-ink-500">No open reports.</p>
      ) : (
        <ul className="space-y-3">
          {items.map((report) => (
            <li key={report.id} className="rounded-xl border border-ink-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{report.listing?.title ?? "Listing removed"}</p>
                  <p className="text-sm text-ink-500">
                    {report.reason.replaceAll("_", " ")} by {report.reporter.name ?? report.reporter.phoneE164}
                  </p>
                </div>
                <button
                  disabled={busy === report.id}
                  onClick={() => resolve(report.id)}
                  className="rounded-lg border border-ink-300 px-3 py-1.5 text-sm hover:bg-ink-50 disabled:opacity-50"
                >
                  Resolve
                </button>
              </div>
              {report.details && <p className="mt-3 whitespace-pre-wrap text-sm text-ink-700">{report.details}</p>}
              {report.listing && (
                <p className="mt-3 text-xs text-ink-500">Fraud score: {report.listing.fraudScore}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
