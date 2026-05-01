"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { api, type Listing } from "@/lib/api";
import { formatKes, formatCategory, photoUrl } from "@/lib/format";

export default function ListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [listing, setListing] = useState<Listing | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Listing>(`/v1/listings/${id}`, { auth: false })
      .then(setListing)
      .catch((e) => setError(e.message));
  }, [id]);

  if (error) return <div className="rounded-lg bg-red-50 p-4 text-red-700">{error}</div>;
  if (!listing) return <div className="text-ink-500">Loading…</div>;

  const main = photoUrl(listing.primaryPhotoKey ?? listing.photoKeys[0]);

  return (
    <article className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold">{listing.title}</h1>
        <p className="text-ink-600">
          {listing.neighborhood}{listing.estate ? ` · ${listing.estate}` : ""} · {formatCategory(listing.category)}
        </p>
        {listing.verificationStatus === "VERIFIED" && (
          <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-800">
            ✓ Verified by Nuru
          </span>
        )}
      </header>

      {main && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={main} alt={listing.title} className="aspect-[16/10] w-full rounded-xl object-cover" />
      )}

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
    </article>
  );
}
