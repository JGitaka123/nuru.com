"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, getToken } from "@/lib/api";
import { formatKes, photoUrl } from "@/lib/format";

interface AppRow {
  id: string;
  status: "SUBMITTED" | "UNDER_REVIEW" | "APPROVED" | "REJECTED" | "WITHDRAWN";
  createdAt: string;
  decidedAt?: string | null;
  aiSummary?: string | null;
  aiRecommendation?: string | null;
  listing: { id: string; title: string; primaryPhotoKey?: string | null; rentKesCents: number };
  lease?: { id: string; status: string } | null;
}

const STATUS_BADGE: Record<string, string> = {
  SUBMITTED: "bg-ink-100 text-ink-800",
  UNDER_REVIEW: "bg-amber-100 text-amber-800",
  APPROVED: "bg-green-100 text-green-800",
  REJECTED: "bg-red-100 text-red-800",
  WITHDRAWN: "bg-ink-200 text-ink-700",
};

export default function MyApplicationsPage() {
  const router = useRouter();
  const [items, setItems] = useState<AppRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getToken()) {
      router.push("/login");
      return;
    }
    api<{ items: AppRow[] }>("/v1/applications/me")
      .then((r) => setItems(r.items))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [router]);

  if (loading) return <div className="text-ink-500">Loading…</div>;
  if (error) return <div className="rounded-lg bg-red-50 p-4 text-red-700">{error}</div>;

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold">My applications</h1>
      {items.length === 0 ? (
        <p className="text-ink-500">No applications yet. <Link href="/search" className="text-brand-600 hover:underline">Browse listings</Link></p>
      ) : (
        <ul className="space-y-3">
          {items.map((a) => (
            <li key={a.id} className="flex gap-4 rounded-xl border border-ink-200 bg-white p-4">
              <div className="h-20 w-20 flex-none overflow-hidden rounded-lg bg-ink-100">
                {a.listing.primaryPhotoKey && photoUrl(a.listing.primaryPhotoKey) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photoUrl(a.listing.primaryPhotoKey)!} alt="" className="h-full w-full object-cover" />
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <Link href={`/listing/${a.listing.id}`} className="truncate font-semibold hover:text-brand-600">
                    {a.listing.title}
                  </Link>
                  <span className={`flex-none rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[a.status]}`}>
                    {a.status.replace("_", " ")}
                  </span>
                </div>
                <p className="mt-1 text-sm">{formatKes(a.listing.rentKesCents)}/mo</p>
                {a.aiRecommendation && (
                  <p className="mt-1 text-xs text-ink-500">AI screen: {a.aiRecommendation}</p>
                )}
                {a.status === "APPROVED" && a.lease && (
                  <Link href={`/me/leases/${a.lease.id}`} className="mt-2 inline-block text-sm font-medium text-brand-600 hover:underline">
                    Continue to deposit →
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
