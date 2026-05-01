"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { formatKes, photoUrl } from "@/lib/format";

interface Item {
  id: string;
  title: string;
  neighborhood: string;
  bedrooms: number;
  rent_kes_cents: number;
  primary_photo_key: string | null;
  score: number;
}

export default function SimilarListings({ listingId }: { listingId: string }) {
  const [items, setItems] = useState<Item[] | null>(null);

  useEffect(() => {
    api<{ items: Item[] }>(`/v1/listings/${listingId}/similar?k=6`, { auth: false })
      .then((r) => setItems(r.items))
      .catch(() => setItems([]));
  }, [listingId]);

  if (items === null) return null;
  if (items.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold">Similar listings</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((i) => (
          <Link key={i.id} href={`/listing/${i.id}`} className="group overflow-hidden rounded-xl border border-ink-200 bg-white hover:shadow-md">
            {i.primary_photo_key && photoUrl(i.primary_photo_key) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoUrl(i.primary_photo_key)!} alt="" className="h-32 w-full object-cover" />
            ) : (
              <div className="h-32 bg-ink-100" />
            )}
            <div className="p-3">
              <p className="truncate text-sm font-semibold group-hover:text-brand-600">{i.title}</p>
              <p className="text-xs text-ink-500">{i.neighborhood} · {i.bedrooms}BR · {formatKes(i.rent_kes_cents)}/mo</p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
