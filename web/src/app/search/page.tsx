"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { api, getToken, type SearchResult } from "@/lib/api";
import { formatKes, photoUrl } from "@/lib/format";
import MapView from "@/components/MapView";
import { ListingCardSkeleton } from "@/components/Skeleton";
import { toast } from "@/components/Toast";

export default function SearchPage() {
  const params = useSearchParams();
  const q = params.get("q") ?? "";

  const [data, setData] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, setQuery] = useState(q);
  const [view, setView] = useState<"grid" | "map">("grid");

  useEffect(() => {
    if (!q) return;
    setLoading(true);
    setError(null);
    api<SearchResult>(`/v1/search?q=${encodeURIComponent(q)}&limit=20`, { auth: false })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [q]);

  async function saveSearch() {
    if (!getToken()) {
      window.location.href = "/login?next=/search?q=" + encodeURIComponent(q);
      return;
    }
    if (!data?.filters) return;
    try {
      await api("/v1/saved-searches", {
        method: "POST",
        body: {
          name: q.slice(0, 80) || "My search",
          query: q,
          neighborhoods: data.filters.neighborhoods,
          bedroomsMin: data.filters.bedroomsMin ?? undefined,
          bedroomsMax: data.filters.bedroomsMax ?? undefined,
          rentMaxKesCents: data.filters.rentMaxKes ? data.filters.rentMaxKes * 100 : undefined,
          mustHave: data.filters.mustHave,
          alertPush: true,
          alertSms: false,
        },
      });
      toast.success("Alert created — we'll notify you of new matches");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Couldn't save");
    }
  }

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

      {data && data.results.length > 0 && (
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-ink-500">{data.results.length} {data.results.length === 1 ? "match" : "matches"}</p>
          <div className="flex gap-2">
            <button onClick={saveSearch} className="rounded-lg border border-brand-300 bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-100">
              ♡ Save this search
            </button>
            <div className="inline-flex overflow-hidden rounded-lg border border-ink-200 bg-white text-sm">
              <button onClick={() => setView("grid")} aria-pressed={view === "grid"}
                className={`px-3 py-1.5 ${view === "grid" ? "bg-ink-900 text-white" : "text-ink-700 hover:bg-ink-50"}`}>Grid</button>
              <button onClick={() => setView("map")} aria-pressed={view === "map"}
                className={`px-3 py-1.5 ${view === "map" ? "bg-ink-900 text-white" : "text-ink-700 hover:bg-ink-50"}`}>Map</button>
            </div>
          </div>
        </div>
      )}

      {loading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <ListingCardSkeleton key={i} />)}
        </div>
      )}
      {error && <div className="rounded-lg bg-red-50 p-4 text-red-700 ring-1 ring-red-200">{error}</div>}

      {data && data.results.length === 0 && !loading && (
        <div className="rounded-xl bg-white p-8 text-center text-ink-500">
          No matches yet. Try expanding your area or budget — or set up a saved search.
        </div>
      )}

      {data && data.results.length > 0 && view === "map" && (
        <MapView items={data.results} />
      )}

      {data && data.results.length > 0 && view === "grid" && (
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
