"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, getToken } from "@/lib/api";
import { formatKes, photoUrl } from "@/lib/format";
import { PageHeading, StatTile } from "@/components/ui";

interface Summary {
  listings: number; active: number; rented: number;
  views: number; inquiries: number; applications: number; viewings: number; saves: number;
}

interface PerListing {
  id: string;
  title: string;
  status: string;
  neighborhood: string;
  rentKesCents: number;
  primaryPhotoKey?: string | null;
  views: number;
  inquiries: number;
  applications: number;
  viewings: number;
  saves: number;
  inquiryRate: number | null;
  applicationRate: number | null;
  daysListed: number | null;
}

export default function AgentAnalyticsPage() {
  const router = useRouter();
  const [days, setDays] = useState(30);
  const [data, setData] = useState<{ summary: Summary; perListing: PerListing[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getToken()) { router.push("/login"); return; }
    setLoading(true);
    api<{ summary: Summary; perListing: PerListing[] }>(`/v1/agent/analytics?days=${days}`)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [router, days]);

  if (loading) return <div className="text-ink-500">Loading…</div>;
  if (error) return <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>;
  if (!data) return null;

  return (
    <div className="space-y-8">
      <PageHeading
        eyebrow="Agent workspace"
        title="Analytics"
        subtitle="How your listings are performing."
        actions={
          <select value={days} onChange={(e) => setDays(Number(e.target.value))}
            className="rounded-xl border border-ink-200 bg-surface px-3 py-2 text-sm">
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
        }
      />

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Active listings" value={`${data.summary.active}/${data.summary.listings}`} />
        <StatTile label="Rented" value={data.summary.rented} />
        <StatTile label="Views" value={data.summary.views.toLocaleString()} />
        <StatTile label="Inquiries" value={data.summary.inquiries} />
        <StatTile label="Applications" value={data.summary.applications} />
        <StatTile label="Viewings booked" value={data.summary.viewings} />
        <StatTile label="Saves" value={data.summary.saves} />
        <StatTile label="Inquiry rate" value={data.summary.views > 0 ? `${Math.round((data.summary.inquiries / data.summary.views) * 100)}%` : "—"} />
      </section>

      <section className="space-y-3">
        <h2 className="font-serif text-xl text-ink-900">Per listing</h2>
        {data.perListing.length === 0 ? (
          <p className="text-ink-500">No listings yet.</p>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-ink-200 shadow-card">
            <table className="w-full bg-surface text-sm">
              <thead className="border-b border-ink-100 text-left text-xs font-medium uppercase tracking-wide text-ink-400">
                <tr>
                  <th className="px-4 py-3">Listing</th>
                  <th className="px-4 py-3">Views</th>
                  <th className="px-4 py-3">Inquiries</th>
                  <th className="px-4 py-3">Applications</th>
                  <th className="px-4 py-3">Saves</th>
                  <th className="px-4 py-3">Days listed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {data.perListing.map((l) => (
                  <tr key={l.id}>
                    <td className="px-4 py-3">
                      <Link href={`/agent/${l.id}`} className="flex items-center gap-2 hover:text-brand-600">
                        {l.primaryPhotoKey && photoUrl(l.primaryPhotoKey) && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={photoUrl(l.primaryPhotoKey)!} alt="" className="h-9 w-9 rounded-lg object-cover" />
                        )}
                        <span>
                          <span className="block font-medium text-ink-900">{l.title || "Untitled"}</span>
                          <span className="text-xs text-ink-500">{l.neighborhood} · {formatKes(l.rentKesCents)}/mo</span>
                        </span>
                      </Link>
                    </td>
                    <td className="px-4 py-3">{l.views}</td>
                    <td className="px-4 py-3">
                      {l.inquiries}
                      {l.inquiryRate !== null && (
                        <span className="ml-1 text-xs text-ink-500">({Math.round(l.inquiryRate * 100)}%)</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {l.applications}
                      {l.applicationRate !== null && (
                        <span className="ml-1 text-xs text-ink-500">({Math.round(l.applicationRate * 100)}%)</span>
                      )}
                    </td>
                    <td className="px-4 py-3">{l.saves}</td>
                    <td className="px-4 py-3">{l.daysListed ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
