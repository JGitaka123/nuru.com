"use client";

import Link from "next/link";
import ListingPhoto from "@/components/ListingPhoto";
import { formatKes, photoUrl } from "@/lib/format";

export interface ListingCardItem {
  id: string;
  title: string;
  neighborhood: string;
  bedrooms: number;
  rentKesCents: number;
  primaryPhotoKey?: string | null;
  description?: string | null;
  bathrooms?: number | null;
  estate?: string | null;
  features?: string[];
  verificationStatus?: string | null;
}

export default function ListingResultCard({ item }: { item: ListingCardItem }) {
  const featureSummary = item.features?.slice(0, 3) ?? [];

  return (
    <article className="group overflow-hidden rounded-lg border border-ink-200 bg-surface transition hover:border-brand-300 hover:shadow-md">
      <Link href={`/listing/${item.id}`} className="grid sm:grid-cols-[240px,1fr]">
        <div className="relative min-h-56 sm:min-h-full">
          <ListingPhoto
            src={item.primaryPhotoKey ? photoUrl(item.primaryPhotoKey) : null}
            alt={item.title}
            className="h-full min-h-56 w-full object-cover"
          />
          {item.verificationStatus === "VERIFIED" && (
            <span className="absolute left-3 top-3 rounded-full bg-white px-3 py-1 text-xs font-semibold text-green-700 shadow-sm">
              Verified
            </span>
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-4 p-4 sm:p-5">
          <div>
            <p className="text-2xl font-bold text-ink-900">{formatKes(item.rentKesCents)}/mo</p>
            <h2 className="mt-1 line-clamp-2 text-lg font-semibold group-hover:text-brand-700">
              {item.title}
            </h2>
            <p className="mt-1 text-sm text-ink-600">
              {item.neighborhood}{item.estate ? `, ${item.estate}` : ""}
            </p>
          </div>

          <div className="flex flex-wrap gap-2 text-sm text-ink-700">
            <span className="rounded-md bg-ink-100 px-2.5 py-1">{item.bedrooms} bedroom</span>
            {item.bathrooms != null && (
              <span className="rounded-md bg-ink-100 px-2.5 py-1">{item.bathrooms} bathroom</span>
            )}
            {featureSummary.map((feature) => (
              <span key={feature} className="rounded-md bg-ink-100 px-2.5 py-1 capitalize">
                {feature.replace(/_/g, " ")}
              </span>
            ))}
          </div>

          {item.description && (
            <p className="line-clamp-2 text-sm leading-6 text-ink-600">{item.description}</p>
          )}

          <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-ink-100 pt-4">
            <span className="text-sm font-medium text-green-700">Escrow-ready deposit</span>
            <span className="rounded-md bg-brand-500 px-4 py-2 text-sm font-semibold text-white group-hover:bg-brand-600">
              View details
            </span>
          </div>
        </div>
      </Link>
    </article>
  );
}
