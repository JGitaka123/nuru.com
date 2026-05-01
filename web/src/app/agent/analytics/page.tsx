"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, getToken } from "@/lib/api";
import { formatKes, photoUrl } from "@/lib/format";

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
  if (error) return <div className="rounded-lg bg-red-50 p-4 text-red-700">{error}</div>;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-bold">Analytics</h1>
          <p className="text-ink-600">How your listings are performing.</p>
        </div>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))}
          className="rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm">
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Active listings" value={`${data.summary.active}/${data.summary.listings}`} />
        <Stat label="Rented" value={data.summary.rented} />
        <Stat label="Views" value={data.summary.views.toLocaleString()} />
        <Stat label="Inquiries" value={data.summary.inquiries} />
        <Stat label="Applications" value={data.summary.applications} />
        <Stat label="Viewings booked" value={data.summary.viewings} />
        <Stat label="Saves" value={data.summary.saves} />
        <Stat label="Inquiry rate" value={data.summary.views > 0 ? `${Math.round((data.summary.inquiries / data.summary.views) * 100)}%` : "—"} />
      </div>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Per listing</h2>
        {data.perListing.length === 0 ? (
          <p className="text-ink-500">No listings yet.</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-ink-200">
            <table className="w-full bg-white text-sm">
              <thead className="bg-ink-50 text-left text-xs uppercase tracking-wide text-ink-500">
                <tr>
                  <th className="px-3 py-2">Listing</th>
                  <th className="px-3 py-2">Views</th>
                  <th className="px-3 py-2">Inquiries</th>
                  <th className="px-3 py-2">Applications</th>
                  <th className="px-3 py-2">Saves</th>
                  <th className="px-3 py-2">Days listed</th>
                </tr>
              </thead>
              <tbody>
                {data.perListing.map((l) => (
                  <tr key={l.id} className="border-t border-ink-100">
                    <td className="px-3 py-2">
                      <Link href={`/agent/${l.id}`} className="flex items-center gap-2 hover:text-brand-600">
                        {l.primaryPhotoKey && photoUrl(l.primaryPhotoKey) && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={photoUrl(l.primaryPhotoKey)!} alt="" className="h-9 w-9 rounded-md object-cover" />
                        )}
                        <span>
                          <span className="block font-medium">{l.title || "Untitled"}</span>
                          <span className="text-xs text-ink-500">{l.neighborhood} · {formatKes(l.rentKesCents)}/mo</span>
                        </span>
                      </Link>
                    </td>
                    <td className="px-3 py-2">{l.views}</td>
                    <td className="px-3 py-2">
                      {l.inquiries}
                      {l.inquiryRate !== null && (
                        <span className="ml-1 text-xs text-ink-500">({Math.round(l.inquiryRate * 100)}%)</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {l.applications}
                      {l.applicationRate !== null && (
                        <span className="ml-1 text-xs text-ink-500">({Math.round(l.applicationRate * 100)}%)</span>
                      )}
                    </td>
                    <td className="px-3 py-2">{l.saves}</td>
                    <td className="px-3 py-2">{l.daysListed ?? "—"}</td>
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

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl bg-white p-4 ring-1 ring-ink-200">
      <p className="text-xs uppercase tracking-wide text-ink-500">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  );
}
