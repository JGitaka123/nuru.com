"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { api, getToken, type SearchResult, type Listing } from "@/lib/api";
import { formatKes, photoUrl } from "@/lib/format";
import MapView from "@/components/MapView";
import { ListingCardSkeleton } from "@/components/Skeleton";
import ListingPhoto from "@/components/ListingPhoto";
import { toast } from "@/components/Toast";

const BROWSE_NEIGHBORHOODS = ["Kilimani", "Westlands", "Kileleshwa", "Lavington", "Parklands"];

function SearchPageInner() {
  const params = useSearchParams();
  const q = params.get("q") ?? "";

  const [data, setData] = useState<SearchResult | null>(null);
  const [browse, setBrowse] = useState<Listing[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, setQuery] = useState(q);
  const [view, setView] = useState<"grid" | "map">("grid");

  useEffect(() => {
    if (!q) {
      // No query yet — show recent listings so the page is browsable.
      setLoading(true);
      api<{ items: Listing[] }>("/v1/listings?limit=12", { auth: false })
        .then((r) => setBrowse(r.items))
        .catch(() => setBrowse([]))
        .finally(() => setLoading(false));
      return;
    }
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

      {data?.degraded && data.results.length > 0 && (
        <p className="text-xs text-ink-400">
          Smart ranking is temporarily unavailable — showing keyword matches.
        </p>
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

      {!q && !loading && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-ink-500">Popular areas:</span>
            {BROWSE_NEIGHBORHOODS.map((n) => (
              <Link key={n} href={`/search?q=${encodeURIComponent(n)}`}
                className="rounded-full border border-ink-200 bg-white px-3 py-1 text-sm text-ink-700 hover:border-brand-300 hover:text-brand-700">
                {n}
              </Link>
            ))}
          </div>
          {browse && browse.length > 0 && (
            <>
              <h2 className="text-lg font-semibold">Recent listings</h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {browse.map((l) => (
                  <Link key={l.id} href={`/listing/${l.id}`} className="group overflow-hidden rounded-xl border border-ink-200 bg-white transition hover:shadow-md">
                    <ListingPhoto src={l.primaryPhotoKey ? photoUrl(l.primaryPhotoKey) : null} alt={l.title} className="h-48 w-full object-cover" />
                    <div className="p-4">
                      <h3 className="font-semibold group-hover:text-brand-600">{l.title}</h3>
                      <p className="mt-1 text-sm text-ink-500">{l.neighborhood} · {l.bedrooms}BR</p>
                      <p className="mt-2 font-semibold">{formatKes(l.rentKesCents)}/mo</p>
                    </div>
                  </Link>
                ))}
              </div>
            </>
          )}
          {browse && browse.length === 0 && (
            <div className="rounded-xl bg-white p-8 text-center text-ink-500">
              No listings yet — check back soon.
            </div>
          )}
        </>
      )}

      {data && data.results.length > 0 && view === "map" && (
        <MapView items={data.results} />
      )}

      {data && data.results.length > 0 && view === "grid" && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.results.map((r) => (
            <Link key={r.id} href={`/listing/${r.id}`} className="group overflow-hidden rounded-xl border border-ink-200 bg-white transition hover:shadow-md">
              <ListingPhoto src={r.primary_photo_key ? photoUrl(r.primary_photo_key) : null} alt={r.title} className="h-48 w-full object-cover" />
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

// useSearchParams() must render inside a Suspense boundary for static export.
export default function SearchPage() {
  return (
    <Suspense>
      <SearchPageInner />
    </Suspense>
  );
}
