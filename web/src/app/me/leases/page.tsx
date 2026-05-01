"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, getToken } from "@/lib/api";
import { formatKes, photoUrl } from "@/lib/format";

interface LeaseRow {
  id: string;
  status: string;
  startDate: string;
  rentKesCents: number;
  listing: { id: string; title: string; neighborhood?: string | null; primaryPhotoKey?: string | null };
  escrow?: { status: string } | null;
}

export default function MyLeasesPage() {
  const router = useRouter();
  const [items, setItems] = useState<LeaseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getToken()) {
      router.push("/login");
      return;
    }
    api<{ items: LeaseRow[] }>("/v1/leases/me")
      .then((r) => setItems(r.items))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [router]);

  if (loading) return <div className="text-ink-500">Loading…</div>;
  if (error) return <div className="rounded-lg bg-red-50 p-4 text-red-700">{error}</div>;

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold">My leases</h1>
      {items.length === 0 ? (
        <p className="text-ink-500">No leases yet.</p>
      ) : (
        <ul className="space-y-3">
          {items.map((l) => (
            <li key={l.id}>
              <Link href={`/me/leases/${l.id}`} className="flex gap-4 rounded-xl border border-ink-200 bg-white p-4 hover:shadow-md">
                <div className="h-20 w-20 flex-none overflow-hidden rounded-lg bg-ink-100">
                  {l.listing.primaryPhotoKey && photoUrl(l.listing.primaryPhotoKey) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={photoUrl(l.listing.primaryPhotoKey)!} alt="" className="h-full w-full object-cover" />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{l.listing.title}</p>
                  <p className="text-sm text-ink-500">{l.listing.neighborhood} · {formatKes(l.rentKesCents)}/mo</p>
                  <p className="mt-1 text-xs">
                    Lease <strong>{l.status.replace("_", " ").toLowerCase()}</strong>
                    {l.escrow && ` · Escrow ${l.escrow.status.toLowerCase()}`}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
