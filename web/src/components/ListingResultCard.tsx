"use client";

import Link from "next/link";
import ListingPhoto from "@/components/ListingPhoto";
import { formatKes, formatKesFull, photoUrl } from "@/lib/format";

export interface ListingCardItem {
  id: string;
  title: string;
  neighborhood: string;
  county?: string | null;
  bedrooms: number;
  rentKesCents: number;
  listingType?: "RENT" | "SALE";
  salePriceKes?: number | null;
  primaryPhotoKey?: string | null;
  description?: string | null;
  bathrooms?: number | null;
  estate?: string | null;
  features?: string[];
  verificationStatus?: string | null;
}

export default function ListingResultCard({ item }: { item: ListingCardItem }) {
  const featureSummary = item.features?.slice(0, 3) ?? [];
  const isSale = item.listingType === "SALE";
  const price = isSale
    ? (item.salePriceKes != null ? formatKesFull(item.salePriceKes) : "Price on request")
    : `${formatKes(item.rentKesCents)}`;

  return (
    <article className="group overflow-hidden rounded-2xl border border-ink-200 bg-surface shadow-card transition duration-200 hover:-translate-y-0.5 hover:border-ink-300 hover:shadow-lift">
      <Link href={`/listing/${item.id}`} className="grid sm:grid-cols-[260px,1fr]">
        <div className="relative min-h-56 overflow-hidden sm:min-h-full">
          <ListingPhoto
            src={item.primaryPhotoKey ? photoUrl(item.primaryPhotoKey) : null}
            alt={item.title}
            className="h-full min-h-56 w-full object-cover transition duration-500 group-hover:scale-[1.03]"
          />
          <div className="absolute left-3 top-3 flex gap-2">
            <span className="rounded-full bg-ink-900/85 px-3 py-1 text-xs font-medium uppercase tracking-wide text-ink-50 backdrop-blur">
              {isSale ? "For sale" : "For rent"}
            </span>
            {item.verificationStatus === "VERIFIED" && (
              <span className="rounded-full bg-surface/90 px-3 py-1 text-xs font-semibold text-emerald-700 shadow-sm backdrop-blur">
                ✓ Verified
              </span>
            )}
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-4 p-5 sm:p-6">
          <div>
            <p className="font-serif text-2xl font-semibold tracking-tightish text-ink-900">
              {price}
              {!isSale && <span className="ml-1 font-sans text-sm font-normal text-ink-500">/month</span>}
            </p>
            <h2 className="mt-1.5 line-clamp-2 font-serif text-lg font-medium text-ink-900 transition-colors group-hover:text-brand-700">
              {item.title}
            </h2>
            <p className="mt-1 text-sm text-ink-500">
              {item.neighborhood}{item.estate ? `, ${item.estate}` : ""}
              {item.county && item.county !== item.neighborhood && (
                <span className="text-ink-400"> · {item.county}</span>
              )}
            </p>
          </div>

          <div className="flex flex-wrap gap-2 text-sm text-ink-700">
            <span className="rounded-full bg-ink-100 px-3 py-1">{item.bedrooms} bed</span>
            {item.bathrooms != null && (
              <span className="rounded-full bg-ink-100 px-3 py-1">{item.bathrooms} bath</span>
            )}
            {featureSummary.map((feature) => (
              <span key={feature} className="rounded-full bg-ink-100 px-3 py-1 capitalize">
                {feature.replace(/_/g, " ")}
              </span>
            ))}
          </div>

          {item.description && (
            <p className="line-clamp-2 text-sm leading-6 text-ink-500">{item.description}</p>
          )}

          <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-ink-100 pt-4">
            <span className="text-sm font-medium text-emerald-700">
              {isSale ? "Contact agent" : "Escrow-protected deposit"}
            </span>
            <span className="inline-flex items-center gap-1 text-sm font-semibold text-ink-900 transition group-hover:text-brand-700">
              View details <span aria-hidden="true">→</span>
            </span>
          </div>
        </div>
      </Link>
    </article>
  );
}
