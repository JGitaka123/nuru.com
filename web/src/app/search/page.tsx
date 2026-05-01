"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { api, type SearchResult } from "@/lib/api";
import { formatKes, photoUrl } from "@/lib/format";

export default function SearchPage() {
  const params = useSearchParams();
  const q = params.get("q") ?? "";

  const [data, setData] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState(q);

  useEffect(() => {
    if (!q) return;
    setLoading(true);
    setError(null);
    api<SearchResult>(`/v1/search?q=${encodeURIComponent(q)}&limit=20`, { auth: false })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [q]);

  return (
    <div className="space-y-6">
      <form className="flex gap-2">
        <input
          name="q"
          defaultValue={q}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1 rounded-lg border border-ink-200 bg-white px-4 py-3 shadow-sm"
          placeholder="What are you looking for?"
        />
        <button type="submit" className="rounded-lg bg-brand-500 px-6 py-3 font-semibold text-white hover:bg-brand-600">
          Search
        </button>
      </form>

      {data?.filters && (data.filters.neighborhoods.length > 0 || data.filters.rentMaxKes || data.filters.mustHave.length > 0) && (
        <div className="flex flex-wrap gap-2 text-sm">
          {data.filters.neighborhoods.map((n) => (
            <span key={n} className="rounded-full bg-brand-100 px-3 py-1 text-brand-800">{n}</span>
          ))}
          {data.filters.rentMaxKes && (
            <span className="rounded-full bg-brand-100 px-3 py-1 text-brand-800">Under KES {data.filters.rentMaxKes.toLocaleString()}</span>
          )}
          {data.filters.mustHave.map((f) => (
            <span key={f} className="rounded-full bg-ink-100 px-3 py-1 text-ink-700">{f.replace(/_/g, " ")}</span>
          ))}
        </div>
      )}

      {data?.clarifyingQuestion && (
        <div className="rounded-lg bg-amber-50 p-4 text-amber-900 ring-1 ring-amber-200">
          <strong>Quick question:</strong> {data.clarifyingQuestion}
        </div>
      )}

      {loading && <SkeletonGrid />}
      {error && <div className="rounded-lg bg-red-50 p-4 text-red-700 ring-1 ring-red-200">{error}</div>}

      {data && data.results.length === 0 && !loading && (
        <div className="rounded-xl bg-white p-8 text-center text-ink-500">
          No matches yet. Try expanding your area or budget — or set up a saved search.
        </div>
      )}

      {data && data.results.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.results.map((r) => (
            <Link key={r.id} href={`/listing/${r.id}`} className="group overflow-hidden rounded-xl border border-ink-200 bg-white transition hover:shadow-md">
              {r.primary_photo_key && photoUrl(r.primary_photo_key) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photoUrl(r.primary_photo_key)!} alt={r.title} className="h-48 w-full object-cover" />
              ) : (
                <div className="flex h-48 items-center justify-center bg-ink-100 text-ink-400">No photo</div>
              )}
              <div className="p-4">
                <h3 className="font-semibold group-hover:text-brand-600">{r.title}</h3>
                <p className="mt-1 text-sm text-ink-500">{r.neighborhood} · {r.bedrooms}BR</p>
                <p className="mt-2 font-semibold">{formatKes(r.rent_kes_cents)}/mo</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="overflow-hidden rounded-xl border border-ink-200 bg-white">
          <div className="h-48 animate-pulse bg-ink-100" />
          <div className="space-y-2 p-4">
            <div className="h-4 w-2/3 animate-pulse rounded bg-ink-100" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-ink-100" />
          </div>
        </div>
      ))}
    </div>
  );
}
