"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, getToken } from "@/lib/api";
import { formatKes, photoUrl } from "@/lib/format";

interface SavedRow {
  id: string;
  notes?: string | null;
  createdAt: string;
  listing: {
    id: string;
    title: string;
    neighborhood: string;
    bedrooms: number;
    rentKesCents: number;
    primaryPhotoKey?: string | null;
    status: string;
  };
}

export default function SavedListingsPage() {
  const router = useRouter();
  const [items, setItems] = useState<SavedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getToken()) {
      router.push("/login");
      return;
    }
    api<{ items: SavedRow[] }>("/v1/saved")
      .then((r) => setItems(r.items))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [router]);

  async function unsave(listingId: string) {
    await api(`/v1/saved/${listingId}`, { method: "DELETE" }).catch(() => undefined);
    setItems((prev) => prev.filter((s) => s.listing.id !== listingId));
  }

  if (loading) return <div className="text-ink-500">Loading…</div>;
  if (error) return <div className="rounded-lg bg-red-50 p-4 text-red-700">{error}</div>;

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold">Saved listings</h1>
      {items.length === 0 ? (
        <p className="text-ink-500">Nothing saved yet. Tap the heart on a listing to save it for later.</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((s) => (
            <li key={s.id} className="overflow-hidden rounded-xl border border-ink-200 bg-white">
              <Link href={`/listing/${s.listing.id}`} className="block">
                {s.listing.primaryPhotoKey && photoUrl(s.listing.primaryPhotoKey) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photoUrl(s.listing.primaryPhotoKey)!} alt="" className="h-40 w-full object-cover" />
                ) : (
                  <div className="h-40 bg-ink-100" />
                )}
              </Link>
              <div className="p-3">
                <Link href={`/listing/${s.listing.id}`} className="font-semibold hover:text-brand-600">
                  {s.listing.title}
                </Link>
                <p className="text-sm text-ink-500">{s.listing.neighborhood} · {s.listing.bedrooms}BR</p>
                <p className="mt-1 font-semibold">{formatKes(s.listing.rentKesCents)}/mo</p>
                {s.listing.status !== "ACTIVE" && (
                  <p className="mt-1 text-xs text-amber-700">No longer active ({s.listing.status.toLowerCase()})</p>
                )}
                <button
                  onClick={() => unsave(s.listing.id)}
                  className="mt-2 text-xs text-ink-500 hover:text-red-700"
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
