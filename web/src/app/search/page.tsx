"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { api, getToken, type SearchResult, type Listing } from "@/lib/api";
import MapView from "@/components/MapView";
import { ListingCardSkeleton } from "@/components/Skeleton";
import { toast } from "@/components/Toast";
import { useI18n } from "@/lib/i18n";
import ListingResultCard, { type ListingCardItem } from "@/components/ListingResultCard";
import { FEATURED_MARKETS } from "@/lib/locations";

const BROWSE_NEIGHBORHOODS = FEATURED_MARKETS.map((m) => m.name);

function SearchPageInner() {
  const { t } = useI18n();
  const params = useSearchParams();
  const q = params.get("q") ?? "";
  const mode: "RENT" | "SALE" = params.get("type") === "SALE" ? "SALE" : "RENT";

  const [data, setData] = useState<SearchResult | null>(null);
  const [browse, setBrowse] = useState<Listing[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, setQuery] = useState(q);
  const [view, setView] = useState<"list" | "map">("list");

  useEffect(() => {
    if (!q) {
      setData(null);
      setError(null);
      setLoading(true);
      api<{ items: Listing[] }>(`/v1/listings?limit=12&listingType=${mode}`, { auth: false })
        .then((r) => setBrowse(r.items))
        .catch(() => setBrowse([]))
        .finally(() => setLoading(false));
      return;
    }
    setBrowse(null);
    setLoading(true);
    setError(null);
    api<SearchResult>(`/v1/search?q=${encodeURIComponent(q)}&limit=20`, { auth: false })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [q, mode]);

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
      toast.success(t("search.alertCreated"));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t("search.couldntSave"));
    }
  }

  const resultsAreSale = data?.filters?.listingType === "SALE";

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      {/* Search bar */}
      <section className="rounded-2xl border border-ink-200 bg-surface p-5 shadow-card sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <ModeToggle mode={mode} q={q} />
          <Link href="/agent/new" className="text-sm font-medium text-ink-500 underline-offset-4 hover:text-ink-900 hover:underline">
            List a property →
          </Link>
        </div>
        <form className="flex flex-col gap-2.5 sm:flex-row">
          <input type="hidden" name="type" value={mode} />
          <label htmlFor="search-query" className="sr-only">Search homes</label>
          <input
            id="search-query"
            name="q"
            defaultValue={q}
            onChange={(e) => setQuery(e.target.value)}
            className="min-h-[3.25rem] flex-1 rounded-xl border border-ink-200 bg-ink-50/60 px-4 text-base outline-none transition focus:border-brand-400 focus:bg-surface focus:ring-4 focus:ring-brand-100"
            placeholder={mode === "SALE" ? "3 bedroom house for sale in Lavington" : t("search.placeholder")}
          />
          <button type="submit" className="min-h-[3.25rem] rounded-xl bg-ink-900 px-7 font-medium text-ink-50 transition hover:bg-ink-800">
            {t("home.search")}
          </button>
        </form>
      </section>

      {/* Filter chips */}
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
        <div className="rounded-xl border border-brand-200 bg-brand-50 p-4 text-brand-900 dark:bg-brand-900/20">
          <strong>{t("search.quickQuestion")}</strong> {data.clarifyingQuestion}
        </div>
      )}

      {data?.degraded && data.results.length > 0 && (
        <p className="text-xs text-ink-400">{t("search.degraded")}</p>
      )}

      {/* Results header */}
      {data && data.results.length > 0 && (
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <h1 className="font-serif text-2xl text-ink-900">
              {data.results.length} {resultsAreSale ? "homes for sale" : "homes to rent"}
            </h1>
            <p className="mt-1 text-sm text-ink-500">Ranked by relevance, verification and quality.</p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={saveSearch} className="rounded-lg border border-ink-200 bg-surface px-3.5 py-2 text-sm font-medium text-ink-700 transition hover:border-ink-300">
              {t("search.saveSearch")}
            </button>
            <div className="inline-flex overflow-hidden rounded-lg border border-ink-200 bg-surface text-sm">
              <button type="button" onClick={() => setView("list")} aria-pressed={view === "list"}
                className={`px-3.5 py-2 ${view === "list" ? "bg-ink-900 text-ink-50" : "text-ink-600 hover:bg-ink-100"}`}>List</button>
              <button type="button" onClick={() => setView("map")} aria-pressed={view === "map"}
                className={`px-3.5 py-2 ${view === "map" ? "bg-ink-900 text-ink-50" : "text-ink-600 hover:bg-ink-100"}`}>{t("search.map")}</button>
            </div>
          </div>
        </div>
      )}

      {loading && (
        <div className="grid gap-5">{Array.from({ length: 5 }).map((_, i) => <ListingCardSkeleton key={i} />)}</div>
      )}
      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>}

      {data && data.results.length === 0 && !loading && (
        <div className="rounded-2xl border border-ink-200 bg-surface p-10 text-center shadow-card">
          <h2 className="font-serif text-2xl text-ink-900">No exact matches yet</h2>
          <p className="mx-auto mt-2 max-w-prose text-ink-500">{t("search.noMatches")}</p>
          <button type="button" onClick={saveSearch} className="mt-5 rounded-xl bg-ink-900 px-5 py-2.5 font-medium text-ink-50 hover:bg-ink-800">Create an alert</button>
        </div>
      )}

      {/* Browse (no query) */}
      {!q && !loading && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-ink-500">{t("search.popularAreas")}</span>
            {BROWSE_NEIGHBORHOODS.map((n) => (
              <Link key={n} href={`/search?q=${encodeURIComponent(n)}&type=${mode}`}
                className="rounded-full border border-ink-200 bg-surface px-3.5 py-1.5 text-sm text-ink-700 transition hover:border-ink-300 hover:text-ink-900">{n}</Link>
            ))}
          </div>
          {browse && browse.length > 0 && (
            <>
              <h2 className="font-serif text-2xl text-ink-900">{mode === "SALE" ? "Homes for sale" : t("search.recentListings")}</h2>
              <div className="grid gap-5">{browse.map((l) => <ListingResultCard key={l.id} item={fromListing(l)} />)}</div>
            </>
          )}
          {browse && browse.length === 0 && (
            <div className="rounded-2xl border border-ink-200 bg-surface p-10 text-center shadow-card">
              <h2 className="font-serif text-2xl text-ink-900">{mode === "SALE" ? "No homes for sale yet" : t("search.noListings")}</h2>
              <p className="mx-auto mt-2 max-w-prose text-ink-500">We are onboarding verified agents now.</p>
              <Link href="/agent/new" className="mt-5 inline-block rounded-xl bg-ink-900 px-5 py-2.5 font-medium text-ink-50 hover:bg-ink-800">List a property</Link>
            </div>
          )}
        </div>
      )}

      {data && data.results.length > 0 && view === "map" && <MapView items={data.results} />}
      {data && data.results.length > 0 && view === "list" && (
        <div className="grid gap-5">{data.results.map((r) => <ListingResultCard key={r.id} item={fromSearchResult(r)} />)}</div>
      )}
    </div>
  );
}

function ModeToggle({ mode, q }: { mode: "RENT" | "SALE"; q: string }) {
  const qs = (m: string) => `/search?${q ? `q=${encodeURIComponent(q)}&` : ""}type=${m}`;
  return (
    <div className="inline-flex rounded-full border border-ink-200 bg-ink-50 p-1 text-sm font-medium">
      <Link href={qs("RENT")} className={`rounded-full px-4 py-1.5 transition ${mode === "RENT" ? "bg-ink-900 text-ink-50" : "text-ink-600 hover:text-ink-900"}`}>Rent</Link>
      <Link href={qs("SALE")} className={`rounded-full px-4 py-1.5 transition ${mode === "SALE" ? "bg-ink-900 text-ink-50" : "text-ink-600 hover:text-ink-900"}`}>Buy</Link>
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense>
      <SearchPageInner />
    </Suspense>
  );
}

function fromListing(listing: Listing): ListingCardItem {
  return {
    id: listing.id,
    title: listing.title,
    neighborhood: listing.neighborhood,
    county: listing.county,
    bedrooms: listing.bedrooms,
    bathrooms: listing.bathrooms,
    rentKesCents: listing.rentKesCents,
    listingType: listing.listingType,
    salePriceKes: listing.salePriceKes,
    primaryPhotoKey: listing.primaryPhotoKey,
    description: listing.description,
    estate: listing.estate,
    features: listing.features,
    verificationStatus: listing.verificationStatus,
  };
}

function fromSearchResult(result: SearchResult["results"][number]): ListingCardItem {
  return {
    id: result.id,
    title: result.title,
    neighborhood: result.neighborhood,
    bedrooms: result.bedrooms,
    rentKesCents: result.rent_kes_cents,
    listingType: result.listing_type,
    salePriceKes: result.sale_price_kes,
    primaryPhotoKey: result.primary_photo_key,
    description: result.description,
    verificationStatus: result.verification_status,
  };
}
