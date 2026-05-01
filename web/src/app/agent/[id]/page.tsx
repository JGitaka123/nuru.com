"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, getToken, type Listing } from "@/lib/api";
import { formatKes, formatCategory, photoUrl } from "@/lib/format";

const NEXT_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ["PENDING_REVIEW", "REMOVED"],
  PENDING_REVIEW: ["ACTIVE", "DRAFT", "REMOVED"],
  ACTIVE: ["PAUSED", "REMOVED"],
  PAUSED: ["ACTIVE", "REMOVED"],
  RENTED: ["ACTIVE", "REMOVED"],
  REMOVED: [],
};

export default function AgentListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [listing, setListing] = useState<Listing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!getToken()) {
      router.push("/login");
      return;
    }
    api<Listing>(`/v1/listings/${id}`).then(setListing).catch((e) => setError(e.message));
  }, [id, router]);

  async function transition(to: string) {
    setBusy(true);
    setError(null);
    try {
      const updated = await api<Listing>(`/v1/listings/${id}/transition`, {
        method: "POST",
        body: { to },
      });
      setListing(updated);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  if (error) return <div className="rounded-lg bg-red-50 p-4 text-red-700">{error}</div>;
  if (!listing) return <div className="text-ink-500">Loading…</div>;

  const transitions = NEXT_TRANSITIONS[listing.status] ?? [];

  return (
    <div className="space-y-6">
      <Link href="/agent" className="text-sm text-ink-500 hover:underline">← Back to my listings</Link>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">{listing.title || "Untitled"}</h1>
          <p className="mt-1 text-ink-600">{listing.neighborhood} · {formatCategory(listing.category)} · {formatKes(listing.rentKesCents)}/mo</p>
        </div>
        <span className="rounded-full bg-ink-100 px-3 py-1 text-sm font-medium">{listing.status}</span>
      </div>

      {listing.fraudScore >= 60 && (
        <div className="rounded-lg bg-red-50 p-4 ring-1 ring-red-200">
          <p className="font-medium text-red-800">Risk score {listing.fraudScore}/100</p>
          <p className="mt-1 text-sm text-red-700">Review the photos and pricing. Listings with high risk scores cannot be published.</p>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {listing.photoKeys.map((k) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={k} src={photoUrl(k)!} alt="" className="aspect-square rounded-lg object-cover ring-1 ring-ink-200" />
        ))}
      </div>

      <section className="rounded-xl bg-white p-6 ring-1 ring-ink-200">
        <h2 className="font-semibold">Description</h2>
        <p className="mt-2 whitespace-pre-line text-ink-700">{listing.description}</p>
      </section>

      <div className="flex flex-wrap gap-2">
        {transitions.map((t) => (
          <button
            key={t}
            onClick={() => transition(t)}
            disabled={busy}
            className="rounded-lg bg-brand-500 px-4 py-2 font-medium text-white hover:bg-brand-600 disabled:opacity-50"
          >
            {t === "PENDING_REVIEW" ? "Submit for review" :
             t === "ACTIVE" ? "Publish" :
             t === "PAUSED" ? "Pause" :
             t === "DRAFT" ? "Back to draft" :
             t === "REMOVED" ? "Remove" : t}
          </button>
        ))}
      </div>
    </div>
  );
}
