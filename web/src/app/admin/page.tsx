"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, getToken } from "@/lib/api";
import { PageHeading, StatTile, Panel, AdminNav } from "@/components/ui";

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

  if (error) return <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>;
  if (!metrics || !funnel) return <div className="text-ink-500">Loading…</div>;

  return (
    <div className="space-y-8">
      <PageHeading eyebrow="Operations" title="Admin overview" />
      <AdminNav active="/admin" />

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatTile label="Users" value={metrics.totals.totalUsers} hint={`${metrics.last24h.usersDay} new in 24h`} />
        <StatTile label="Active listings" value={`${metrics.totals.activeListings}/${metrics.totals.totalListings}`} />
        <StatTile label="Active leases" value={metrics.operational.leasesActive} />
        <StatTile label="Escrows held" value={metrics.operational.escrowsHeld} />
        <StatTile label="Open reports" value={metrics.operational.openReports} />
        <StatTile label="Viewings (24h)" value={metrics.last24h.viewingsDay} />
      </section>

      <section className="space-y-3">
        <h2 className="font-serif text-xl text-ink-900">Funnel — last {funnel.days} days</h2>
        <Panel>
          <ol className="space-y-3">
            {funnel.funnel.map((s, i) => {
              const max = funnel.funnel[0]?.count || 1;
              const width = Math.max(2, (s.count / max) * 100);
              return (
                <li key={s.stage} className="flex items-center gap-3 text-sm">
                  <span className="w-44 text-ink-600">{i + 1}. {s.stage.replace(/_/g, " ")}</span>
                  <span className="w-12 font-medium text-ink-900">{s.count.toLocaleString()}</span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-ink-100">
                    <span className="block h-full rounded-full bg-brand-400" style={{ width: `${width}%` }} aria-hidden="true" />
                  </span>
                </li>
              );
            })}
          </ol>
        </Panel>
      </section>
    </div>
  );
}
