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

const BROWSE_NEIGHBORHOODS = ["Kilimani", "Westlands", "Kileleshwa", "Lavington", "Parklands"];

function SearchPageInner() {
  const { t } = useI18n();
  const params = useSearchParams();
  const q = params.get("q") ?? "";

  const [data, setData] = useState<SearchResult | null>(null);
  const [browse, setBrowse] = useState<Listing[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, setQuery] = useState(q);
  const [view, setView] = useState<"list" | "map">("list");

  useEffect(() => {
    if (!q) {
      // Clear any prior search so results don't linger above the browse grid.
      setData(null);
      setError(null);
      setLoading(true);
      api<{ items: Listing[] }>("/v1/listings?limit=12", { auth: false })
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
      toast.success(t("search.alertCreated"));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t("search.couldntSave"));
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-ink-200 bg-surface p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase text-brand-700">Rent in Nairobi</p>
            <h1 className="text-2xl font-semibold">Find verified homes faster</h1>
          </div>
          <Link href="/agent" className="rounded-md border border-ink-300 px-3 py-2 text-sm font-semibold text-ink-700 hover:border-brand-300 hover:text-brand-700">
            List a property
          </Link>
        </div>
        <form className="flex flex-col gap-2 sm:flex-row">
          <label htmlFor="search-query" className="sr-only">Search rentals</label>
          <input
            id="search-query"
            name="q"
            defaultValue={q}
            onChange={(e) => setQuery(e.target.value)}
            className="min-h-12 flex-1 rounded-md border border-ink-200 bg-surface px-4 shadow-sm outline-none focus:border-brand-300 focus:ring-2 focus:ring-brand-100"
            placeholder={t("search.placeholder")}
          />
          <button type="submit" className="min-h-12 rounded-md bg-brand-500 px-6 font-semibold text-white hover:bg-brand-600">
            {t("home.search")}
          </button>
        </form>
      </section>

      {data?.filters && (data.filters.neighborhoods.length > 0 || data.filters.rentMaxKes || data.filters.mustHave.length > 0) && (
        <div className="flex flex-wrap gap-2 text-sm">
          {data.filters.neighborhoods.map((n) => (
            <span key={n} className="rounded-full bg-brand-100 px-3 py-1 text-brand-800">{n}</span>
          ))}
          {data.filters.rentMaxKes && (
            <span className="rounded-full bg-brand-100 px-3 py-1 text-brand-800">
              Under KES {data.filters.rentMaxKes.toLocaleString()}
            </span>
          )}
          {data.filters.mustHave.map((f) => (
            <span key={f} className="rounded-full bg-ink-100 px-3 py-1 text-ink-700">{f.replace(/_/g, " ")}</span>
          ))}
        </div>
      )}

      {data?.clarifyingQuestion && (
        <div className="rounded-lg bg-amber-50 p-4 text-amber-900 ring-1 ring-amber-200">
          <strong>{t("search.quickQuestion")}</strong> {data.clarifyingQuestion}
        </div>
      )}

      {data?.degraded && data.results.length > 0 && (
        <p className="text-xs text-ink-400">{t("search.degraded")}</p>
      )}

      {data && data.results.length > 0 && (
        <div className="flex flex-col justify-between gap-3 rounded-lg border border-ink-200 bg-surface p-4 sm:flex-row sm:items-center">
          <div>
            <p className="text-lg font-semibold">
              {data.results.length} {data.results.length === 1 ? t("search.matchOne") : t("search.matchMany")}
            </p>
            <p className="text-sm text-ink-500">Sorted by relevance, verification, and listing quality.</p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={saveSearch} className="rounded-lg border border-brand-300 bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-100">
              {t("search.saveSearch")}
            </button>
            <div className="inline-flex overflow-hidden rounded-lg border border-ink-200 bg-surface text-sm">
              <button
                type="button"
                onClick={() => setView("list")}
                aria-pressed={view === "list"}
                className={`px-3 py-1.5 ${view === "list" ? "bg-ink-900 text-white" : "text-ink-700 hover:bg-ink-50"}`}
              >
                List
              </button>
              <button
                type="button"
                onClick={() => setView("map")}
                aria-pressed={view === "map"}
                className={`px-3 py-1.5 ${view === "map" ? "bg-ink-900 text-white" : "text-ink-700 hover:bg-ink-50"}`}
              >
                {t("search.map")}
              </button>
            </div>
          </div>
        </div>
      )}

      {loading && (
        <div className="grid gap-4">
          {Array.from({ length: 6 }).map((_, i) => <ListingCardSkeleton key={i} />)}
        </div>
      )}
      {error && <div className="rounded-lg bg-red-50 p-4 text-red-700 ring-1 ring-red-200">{error}</div>}

      {data && data.results.length === 0 && !loading && (
        <div className="rounded-lg border border-ink-200 bg-surface p-8 text-center">
          <h2 className="text-xl font-semibold text-ink-900">No exact matches yet</h2>
          <p className="mx-auto mt-2 max-w-xl text-ink-500">
            Try expanding your area or budget, or save this search so Nuru can alert you when a matching verified home goes live.
          </p>
          <button type="button" onClick={saveSearch} className="mt-4 rounded-md bg-brand-500 px-4 py-2 font-semibold text-white hover:bg-brand-600">
            Create alert
          </button>
        </div>
      )}

      {!q && !loading && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-ink-500">{t("search.popularAreas")}</span>
            {BROWSE_NEIGHBORHOODS.map((n) => (
              <Link
                key={n}
                href={`/search?q=${encodeURIComponent(n)}`}
                className="rounded-full border border-ink-200 bg-surface px-3 py-1 text-sm text-ink-700 hover:border-brand-300 hover:text-brand-700"
              >
                {n}
              </Link>
            ))}
          </div>
          {browse && browse.length > 0 && (
            <>
              <div>
                <p className="text-sm font-semibold uppercase text-brand-700">Browse</p>
                <h2 className="text-xl font-semibold">{t("search.recentListings")}</h2>
              </div>
              <div className="grid gap-4">
                {browse.map((l) => <ListingResultCard key={l.id} item={fromListing(l)} />)}
              </div>
            </>
          )}
          {browse && browse.length === 0 && (
            <div className="rounded-lg border border-ink-200 bg-surface p-8 text-center">
              <h2 className="text-xl font-semibold text-ink-900">Listings are being prepared</h2>
              <p className="mx-auto mt-2 max-w-xl text-ink-500">
                We are onboarding verified agents now. List the first property if you are an agent.
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <Link href="/agent" className="rounded-md bg-brand-500 px-4 py-2 font-semibold text-white hover:bg-brand-600">
                  List property
                </Link>
              </div>
            </div>
          )}
        </>
      )}

      {data && data.results.length > 0 && view === "map" && (
        <MapView items={data.results} />
      )}

      {data && data.results.length > 0 && view === "list" && (
        <div className="grid gap-4">
          {data.results.map((r) => (
            <ListingResultCard key={r.id} item={fromSearchResult(r)} />
          ))}
        </div>
      )}
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
    bedrooms: listing.bedrooms,
    bathrooms: listing.bathrooms,
    rentKesCents: listing.rentKesCents,
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
    primaryPhotoKey: result.primary_photo_key,
    description: result.description,
    verificationStatus: result.verification_status,
  };
}
