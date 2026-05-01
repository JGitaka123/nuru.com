"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, getToken } from "@/lib/api";

interface Metrics {
  totals: { totalUsers: number; totalListings: number; activeListings: number };
  last24h: { usersDay: number; listingsDay: number; viewingsDay: number; applicationsDay: number };
  operational: { escrowsHeld: number; leasesActive: number; openReports: number };
}

interface Funnel {
  days: number;
  funnel: Array<{ stage: string; count: number }>;
}

export default function AdminDashboard() {
  const router = useRouter();
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [funnel, setFunnel] = useState<Funnel | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getToken()) { router.push("/login"); return; }
    Promise.all([
      api<Metrics>("/v1/admin/metrics"),
      api<Funnel>("/v1/admin/funnel?days=7"),
    ])
      .then(([m, f]) => { setMetrics(m); setFunnel(f); })
      .catch((e) => setError(e.message));
  }, [router]);

  if (error) return <div className="rounded-lg bg-red-50 p-4 text-red-700">{error}</div>;
  if (!metrics || !funnel) return <div className="text-ink-500">Loading…</div>;

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Admin</h1>

      <nav className="flex flex-wrap gap-2 text-sm">
        {[
          ["/admin/leads", "Leads"],
          ["/admin/campaigns", "Campaigns"],
          ["/admin/reports", "Fraud reports"],
          ["/admin/ai-queue", "AI feedback"],
          ["/admin/verification", "Verification queue"],
        ].map(([href, label]) => (
          <Link key={href} href={href} className="rounded-lg border border-ink-300 bg-white px-3 py-1.5 hover:bg-ink-50">
            {label}
          </Link>
        ))}
      </nav>

      <section className="grid gap-3 sm:grid-cols-3">
        <Stat label="Users" value={metrics.totals.totalUsers} />
        <Stat label="Active listings" value={`${metrics.totals.activeListings}/${metrics.totals.totalListings}`} />
        <Stat label="Active leases" value={metrics.operational.leasesActive} />
        <Stat label="Escrows held" value={metrics.operational.escrowsHeld} />
        <Stat label="Open reports" value={metrics.operational.openReports} />
        <Stat label="24h new users" value={metrics.last24h.usersDay} />
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold">Funnel — last {funnel.days} days</h2>
        <ol className="space-y-2 rounded-xl bg-white p-4 ring-1 ring-ink-200">
          {funnel.funnel.map((s, i) => {
            const max = funnel.funnel[0]?.count || 1;
            const width = Math.max(2, (s.count / max) * 100);
            return (
              <li key={s.stage} className="flex items-center gap-3 text-sm">
                <span className="w-40 text-ink-700">{i + 1}. {s.stage.replace("_", " ")}</span>
                <span className="font-medium">{s.count.toLocaleString()}</span>
                <span className="ml-auto h-2 rounded-full bg-brand-200" style={{ width: `${width}%` }} aria-hidden="true" />
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl bg-white p-4 ring-1 ring-ink-200">
      <p className="text-xs uppercase tracking-wide text-ink-500">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  );
}
