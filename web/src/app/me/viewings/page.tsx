"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, getToken } from "@/lib/api";

interface ViewingRow {
  id: string;
  scheduledAt: string;
  status: string;
  notes?: string | null;
  rating?: number | null;
  listing: { id: string; title: string; neighborhood?: string; primaryPhotoKey?: string | null };
  tenant?: { id: string; name: string | null; phoneE164: string };
}

const STATUS_LABEL: Record<string, string> = {
  REQUESTED: "Awaiting confirmation",
  CONFIRMED: "Confirmed",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  NO_SHOW: "No show",
};

export default function MyViewingsPage() {
  const router = useRouter();
  const [items, setItems] = useState<ViewingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getToken()) {
      router.push("/login");
      return;
    }
    api<{ items: ViewingRow[] }>("/v1/viewings/me")
      .then((r) => setItems(r.items))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [router]);

  if (loading) return <div className="text-ink-500">Loading…</div>;
  if (error) return <div className="rounded-lg bg-red-50 p-4 text-red-700">{error}</div>;

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold">My viewings</h1>

      {items.length === 0 ? (
        <p className="text-ink-500">No viewings yet. <Link href="/search" className="text-brand-600 hover:underline">Browse listings</Link></p>
      ) : (
        <ul className="space-y-3">
          {items.map((v) => (
            <li key={v.id} className="flex items-center justify-between gap-4 rounded-xl border border-ink-200 bg-white p-4">
              <div>
                <Link href={`/listing/${v.listing.id}`} className="font-semibold hover:text-brand-600">
                  {v.listing.title}
                </Link>
                <p className="text-sm text-ink-500">
                  {new Date(v.scheduledAt).toLocaleString("en-KE", { timeZone: "Africa/Nairobi", dateStyle: "medium", timeStyle: "short" })}
                </p>
                {v.tenant && <p className="text-xs text-ink-500">Tenant: {v.tenant.name ?? v.tenant.phoneE164}</p>}
              </div>
              <span className="rounded-full bg-ink-100 px-3 py-1 text-xs font-medium">{STATUS_LABEL[v.status] ?? v.status}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
