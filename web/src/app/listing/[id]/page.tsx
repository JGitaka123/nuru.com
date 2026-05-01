"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { api, type Listing } from "@/lib/api";
import { formatKes, formatCategory } from "@/lib/format";
import SaveButton from "@/components/SaveButton";
import SimilarListings from "@/components/SimilarListings";
import ImageGallery from "@/components/ImageGallery";
import { Skeleton } from "@/components/Skeleton";

interface MarketCmp {
  hasBand: boolean;
  band?: { median: number; p25: number; p75: number; sampleSize: number };
  ratio?: number;
  label?: "below" | "at" | "above";
  percentDiff?: number;
}

export default function ListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [listing, setListing] = useState<Listing | null>(null);
  const [market, setMarket] = useState<MarketCmp | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Listing>(`/v1/listings/${id}`, { auth: false })
      .then(setListing)
      .catch((e) => setError(e.message));
    api<MarketCmp>(`/v1/listings/${id}/market`, { auth: false })
      .then(setMarket)
      .catch(() => setMarket(null));
  }, [id]);

  if (error) return <div className="rounded-lg bg-red-50 p-4 text-red-700">{error}</div>;
  if (!listing) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="aspect-[16/10] w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  const allKeys = listing.primaryPhotoKey
    ? [listing.primaryPhotoKey, ...listing.photoKeys.filter((k) => k !== listing.primaryPhotoKey)]
    : listing.photoKeys;

  return (
    <article className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold">{listing.title}</h1>
          <p className="text-ink-600">
            {listing.neighborhood}{listing.estate ? ` · ${listing.estate}` : ""} · {formatCategory(listing.category)}
          </p>
          {listing.verificationStatus === "VERIFIED" && (
            <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-800">
              ✓ Verified by Nuru
            </span>
          )}
        </div>
        <SaveButton listingId={listing.id} />
      </header>

      <ImageGallery keys={allKeys} alt={listing.title} />

      <div className="grid gap-6 lg:grid-cols-[2fr,1fr]">
        <div className="space-y-4">
          <p className="whitespace-pre-line text-ink-800">{listing.description}</p>
          {listing.features.length > 0 && (
            <div>
              <h2 className="font-semibold">Features</h2>
              <ul className="mt-2 grid grid-cols-2 gap-2 text-sm">
                {listing.features.map((f) => (
                  <li key={f} className="rounded-md bg-ink-100 px-3 py-2 capitalize">{f.replace(/_/g, " ")}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <aside className="space-y-4 rounded-xl border border-ink-200 bg-white p-6">
          <div>
            <p className="text-sm text-ink-500">Rent</p>
            <p className="text-2xl font-bold">{formatKes(listing.rentKesCents)}/mo</p>
            {market?.hasBand && market.label && (
              <p className={`mt-1 text-xs font-medium ${
                market.label === "below" ? "text-green-700" :
                market.label === "above" ? "text-amber-700" : "text-ink-500"
              }`}>
                {market.label === "below" && `${Math.round(Math.abs(market.percentDiff!))}% below market`}
                {market.label === "at" && `Around market rate`}
                {market.label === "above" && `${Math.round(market.percentDiff!)}% above market`}
                <span className="text-ink-500"> (median {formatKes(market.band!.median)})</span>
              </p>
            )}
          </div>
          <div>
            <p className="text-sm text-ink-500">Deposit</p>
            <p>{listing.depositMonths} month{listing.depositMonths === 1 ? "" : "s"} (held in M-Pesa escrow)</p>
          </div>
          <div className="text-sm text-ink-500">
            <p>{listing.bedrooms} bedroom · {listing.bathrooms} bathroom</p>
          </div>
          <Link
            href={`/listing/${listing.id}/book`}
            className="block w-full rounded-lg bg-brand-500 py-3 text-center font-semibold text-white hover:bg-brand-600"
          >
            Book a viewing
          </Link>
          <Link
            href={`/listing/${listing.id}/apply`}
            className="block w-full rounded-lg border border-brand-300 py-3 text-center font-semibold text-brand-700 hover:bg-brand-50"
          >
            Apply to rent
          </Link>
          {listing.agent && (
            <div className="border-t border-ink-100 pt-4 text-sm">
              <p className="text-ink-500">Listed by</p>
              <p className="font-medium">{listing.agent.name ?? "Agent"}</p>
              {listing.agent.verificationStatus === "VERIFIED" && (
                <span className="text-xs text-green-700">✓ Verified agent</span>
              )}
            </div>
          )}
        </aside>
      </div>

      <SimilarListings listingId={listing.id} />
    </article>
  );
}
