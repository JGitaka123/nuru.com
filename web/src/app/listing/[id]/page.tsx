"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, type Listing } from "@/lib/api";
import { formatKes, formatKesFull, formatCategory } from "@/lib/format";
import SaveButton from "@/components/SaveButton";
import SimilarListings from "@/components/SimilarListings";
import ImageGallery from "@/components/ImageGallery";
import MapView from "@/components/MapView";
import ReviewsBlock from "@/components/ReviewsBlock";
import ChatStarter from "@/components/ChatStarter";
import { Skeleton } from "@/components/Skeleton";

interface MarketCmp {
  hasBand: boolean;
  band?: { median: number; p25: number; p75: number; sampleSize: number };
  ratio?: number;
  label?: "below" | "at" | "above";
  percentDiff?: number;
}

export default function ListingPage({ params }: { params: { id: string } }) {
  const { id } = params;
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

  if (error) return <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>;
  if (!listing) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="aspect-[16/10] w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  const isSale = listing.listingType === "SALE";
  const allKeys = listing.primaryPhotoKey
    ? [listing.primaryPhotoKey, ...listing.photoKeys.filter((k) => k !== listing.primaryPhotoKey)]
    : listing.photoKeys;

  return (
    <article className="mx-auto max-w-5xl space-y-8">
      <nav className="text-sm text-ink-400">
        <Link href={isSale ? "/search?type=SALE" : "/search"} className="hover:text-ink-700">
          ← Back to {isSale ? "homes for sale" : "rentals"}
        </Link>
      </nav>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-ink-900 px-3 py-1 text-xs font-medium uppercase tracking-wide text-ink-50">
              {isSale ? "For sale" : "For rent"}
            </span>
            {listing.verificationStatus === "VERIFIED" && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800">
                ✓ Verified by Nuru
              </span>
            )}
          </div>
          <h1 className="font-serif text-3xl leading-tight text-ink-900 sm:text-4xl">{listing.title}</h1>
          <p className="text-ink-500">
            {listing.neighborhood}{listing.estate ? ` · ${listing.estate}` : ""}
            {listing.county && listing.county !== listing.neighborhood ? ` · ${listing.county}` : ""} · {formatCategory(listing.category)}
          </p>
        </div>
        <SaveButton listingId={listing.id} />
      </header>

      <ImageGallery keys={allKeys} alt={listing.title} />

      <div className="grid gap-8 lg:grid-cols-[1.9fr_1fr]">
        <div className="space-y-8">
          <p className="max-w-prose whitespace-pre-line text-lg leading-8 text-ink-700">{listing.description}</p>

          {listing.features.length > 0 && (
            <div>
              <h2 className="font-serif text-xl text-ink-900">Features</h2>
              <ul className="mt-3 grid grid-cols-2 gap-2.5 text-sm sm:grid-cols-3">
                {listing.features.map((f) => (
                  <li key={f} className="rounded-lg border border-ink-200 bg-surface px-3 py-2.5 capitalize text-ink-700">
                    {f.replace(/_/g, " ")}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {listing.lat != null && listing.lng != null && (
            <section>
              <h2 className="mb-3 font-serif text-xl text-ink-900">Location</h2>
              <MapView items={[{
                id: listing.id, title: listing.title, neighborhood: listing.neighborhood,
                rent_kes_cents: listing.rentKesCents, bedrooms: listing.bedrooms,
                lat: listing.lat, lng: listing.lng,
              }]} />
            </section>
          )}
        </div>

        {/* Sticky price / action card */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="space-y-5 rounded-2xl border border-ink-200 bg-surface p-6 shadow-card">
            <div>
              <p className="text-sm text-ink-500">{isSale ? "Asking price" : "Monthly rent"}</p>
              <p className="font-serif text-3xl font-semibold tracking-tightish text-ink-900">
                {isSale
                  ? (listing.salePriceKes != null ? formatKesFull(listing.salePriceKes) : "Price on request")
                  : <>{formatKes(listing.rentKesCents)}<span className="ml-1 font-sans text-base font-normal text-ink-500">/month</span></>}
              </p>
              {!isSale && market?.hasBand && market.label && (
                <p className={`mt-1.5 text-xs font-medium ${
                  market.label === "below" ? "text-emerald-700" : market.label === "above" ? "text-amber-700" : "text-ink-500"
                }`}>
                  {market.label === "below" && `${Math.round(Math.abs(market.percentDiff!))}% below market`}
                  {market.label === "at" && "Around market rate"}
                  {market.label === "above" && `${Math.round(market.percentDiff!)}% above market`}
                  <span className="text-ink-400"> · median {formatKes(market.band!.median)}</span>
                </p>
              )}
            </div>

            <div className="flex gap-2 text-sm text-ink-600">
              <span className="rounded-full bg-ink-100 px-3 py-1">{listing.bedrooms} bed</span>
              <span className="rounded-full bg-ink-100 px-3 py-1">{listing.bathrooms} bath</span>
            </div>

            {!isSale && (
              <div className="rounded-xl bg-ink-50 p-3 text-sm text-ink-600">
                Deposit: <span className="font-medium text-ink-900">{listing.depositMonths} month{listing.depositMonths === 1 ? "" : "s"}</span> — held in M-Pesa escrow until you move in.
              </div>
            )}

            <div className="space-y-2.5">
              <Link href={`/listing/${listing.id}/book`}
                className="block w-full rounded-xl bg-brand-500 py-3 text-center font-medium text-white transition hover:bg-brand-600">
                {isSale ? "Request a viewing" : "Book a viewing"}
              </Link>
              {isSale ? (
                <ChatStarter listingId={listing.id} />
              ) : (
                <>
                  <Link href={`/listing/${listing.id}/apply`}
                    className="block w-full rounded-xl border border-ink-300 py-3 text-center font-medium text-ink-800 transition hover:border-ink-400">
                    Apply to rent
                  </Link>
                  <ChatStarter listingId={listing.id} />
                </>
              )}
            </div>

            {isSale && (
              <p className="text-center text-xs text-ink-400">
                Sales are handled directly with the agent — no online payment on Nuru.
              </p>
            )}

            {listing.agent && (
              <div className="border-t border-ink-100 pt-4 text-sm">
                <p className="text-ink-500">Listed by</p>
                <p className="font-medium text-ink-900">{listing.agent.name ?? "Agent"}</p>
                {listing.agent.verificationStatus === "VERIFIED" && (
                  <span className="text-xs text-emerald-700">✓ Verified agent</span>
                )}
              </div>
            )}
          </div>
        </aside>
      </div>

      <ReviewsBlock listingId={listing.id} />
      <SimilarListings listingId={listing.id} />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "RealEstateListing",
            name: listing.title,
            description: listing.description,
            url: `${process.env.NEXT_PUBLIC_WEB_URL ?? "https://nuruhomes.com"}/listing/${listing.id}`,
            address: {
              "@type": "PostalAddress",
              addressLocality: listing.neighborhood,
              addressRegion: listing.county ?? "Kenya",
              addressCountry: "KE",
            },
            numberOfRooms: listing.bedrooms,
            numberOfBathroomsTotal: listing.bathrooms,
            offers: {
              "@type": "Offer",
              price: isSale ? (listing.salePriceKes ?? undefined) : Math.round(listing.rentKesCents / 100),
              priceCurrency: "KES",
              availability: listing.status === "ACTIVE" ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
            },
            image: listing.primaryPhotoKey ? `${process.env.NEXT_PUBLIC_PHOTO_URL ?? "https://photos.nuruhomes.com"}/${listing.primaryPhotoKey}` : undefined,
          }),
        }}
      />
    </article>
  );
}
