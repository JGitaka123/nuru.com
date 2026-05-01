"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, getToken, type Listing, type SessionUser } from "@/lib/api";
import { formatKes, formatCategory, photoUrl } from "@/lib/format";

const STATUS_BADGE: Record<string, string> = {
  DRAFT: "bg-ink-100 text-ink-700",
  PENDING_REVIEW: "bg-amber-100 text-amber-800",
  ACTIVE: "bg-green-100 text-green-800",
  PAUSED: "bg-ink-200 text-ink-800",
  RENTED: "bg-brand-100 text-brand-800",
  REMOVED: "bg-red-100 text-red-800",
};

export default function AgentDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getToken()) {
      router.push("/login");
      return;
    }
    Promise.all([
      api<SessionUser>("/v1/auth/me"),
      api<{ items: Listing[] }>("/v1/listings/me"),
    ])
      .then(([u, l]) => { setUser(u); setListings(l.items); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [router]);

  if (loading) return <div className="text-ink-500">Loading…</div>;
  if (error) return <div className="rounded-lg bg-red-50 p-4 text-red-700">{error}</div>;
  if (user && user.role !== "AGENT" && user.role !== "LANDLORD" && user.role !== "ADMIN") {
    return (
      <div className="rounded-xl bg-white p-8">
        <h1 className="text-xl font-bold">Agent dashboard</h1>
        <p className="mt-2 text-ink-600">This area is for agents and landlords. Switch your account or contact us.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-bold">My listings</h1>
          <p className="text-ink-600">Hi {user?.name ?? "there"} — let&apos;s get your properties in front of tenants.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/agent/analytics" className="rounded-lg border border-ink-300 bg-white px-4 py-2 font-medium hover:bg-ink-50">
            Analytics
          </Link>
          <Link href="/agent/inbox" className="rounded-lg border border-ink-300 bg-white px-4 py-2 font-medium hover:bg-ink-50">
            Inbox
          </Link>
          <Link href="/agent/new" className="rounded-lg bg-brand-500 px-4 py-2 font-semibold text-white hover:bg-brand-600">
            + New listing
          </Link>
        </div>
      </div>

      {user?.verificationStatus !== "VERIFIED" && (
        <div className="rounded-xl bg-amber-50 p-4 ring-1 ring-amber-200">
          <p className="font-medium text-amber-900">Verify your account to publish listings.</p>
          <p className="mt-1 text-sm text-amber-800">Add your KRA PIN and ID. Takes 2 minutes.</p>
          <Link href="/agent/verify" className="mt-2 inline-block rounded-md bg-amber-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-amber-600">
            Verify now
          </Link>
        </div>
      )}

      {listings.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-ink-200 p-8 text-center">
          <p className="text-ink-600">No listings yet. Take 6 photos and let AI draft the rest.</p>
          <Link href="/agent/new" className="mt-3 inline-block rounded-md bg-brand-500 px-4 py-2 font-semibold text-white hover:bg-brand-600">
            Create your first listing
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {listings.map((l) => (
            <Link key={l.id} href={`/agent/${l.id}`} className="flex gap-4 rounded-xl border border-ink-200 bg-white p-4 hover:shadow-md">
              <div className="h-24 w-24 flex-none overflow-hidden rounded-lg bg-ink-100">
                {l.primaryPhotoKey && photoUrl(l.primaryPhotoKey) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photoUrl(l.primaryPhotoKey)!} alt="" className="h-full w-full object-cover" />
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="truncate font-semibold">{l.title || "Untitled"}</h2>
                  <span className={`flex-none rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[l.status] ?? "bg-ink-100"}`}>
                    {l.status}
                  </span>
                </div>
                <p className="text-sm text-ink-500">{l.neighborhood} · {formatCategory(l.category)}</p>
                <p className="mt-1 font-semibold">{formatKes(l.rentKesCents)}/mo</p>
                {l.fraudScore >= 60 && (
                  <p className="mt-1 text-xs text-red-700">⚠ Risk score {l.fraudScore} — review before publishing</p>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
