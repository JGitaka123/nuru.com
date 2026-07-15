"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, getToken, type Listing, type SessionUser } from "@/lib/api";
import { formatKes, formatKesFull, formatCategory, photoUrl } from "@/lib/format";
import { PageHeading, StatTile, StatusBadge, btnSecondary, btnBrand } from "@/components/ui";

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
  if (error) return <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>;
  if (user && user.role !== "AGENT" && user.role !== "LANDLORD" && user.role !== "ADMIN") {
    return (
      <div className="rounded-2xl border border-ink-200 bg-surface p-8 shadow-card">
        <h1 className="font-serif text-2xl text-ink-900">Agent dashboard</h1>
        <p className="mt-2 text-ink-600">This area is for agents and landlords. Switch your account or contact us.</p>
      </div>
    );
  }

  const active = listings.filter((l) => l.status === "ACTIVE").length;
  const forSale = listings.filter((l) => l.listingType === "SALE").length;

  return (
    <div className="space-y-8">
      <PageHeading
        eyebrow="Agent workspace"
        title="My listings"
        subtitle={`Hi ${user?.name ?? "there"} — let's get your properties in front of buyers and tenants.`}
        actions={
          <>
            <Link href="/agent/analytics" className={btnSecondary}>Analytics</Link>
            <Link href="/agent/inbox" className={btnSecondary}>Inbox</Link>
            <Link href="/agent/new" className={btnBrand}>+ New listing</Link>
          </>
        }
      />

      {listings.length > 0 && (
        <section className="grid gap-4 sm:grid-cols-3">
          <StatTile label="Listings" value={listings.length} hint={`${active} active`} />
          <StatTile label="For rent" value={listings.length - forSale} />
          <StatTile label="For sale" value={forSale} />
        </section>
      )}

      {user?.verificationStatus !== "VERIFIED" && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <p className="font-medium text-amber-900">Verify your account to publish listings.</p>
          <p className="mt-1 text-sm text-amber-800">Add your KRA PIN and ID — takes 2 minutes.</p>
          <Link href="/agent/verify" className="mt-3 inline-block rounded-lg bg-amber-500 px-3.5 py-2 text-sm font-medium text-white hover:bg-amber-600">
            Verify now
          </Link>
        </div>
      )}

      {listings.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-ink-200 p-12 text-center">
          <h2 className="font-serif text-xl text-ink-900">No listings yet</h2>
          <p className="mt-2 text-ink-500">Take 6 photos and let AI draft the rest.</p>
          <Link href="/agent/new" className="mt-5 inline-block rounded-xl bg-brand-500 px-5 py-2.5 font-medium text-white hover:bg-brand-600">
            Create your first listing
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {listings.map((l) => {
            const isSale = l.listingType === "SALE";
            return (
              <Link key={l.id} href={`/agent/${l.id}`}
                className="flex gap-4 rounded-2xl border border-ink-200 bg-surface p-4 shadow-card transition hover:-translate-y-0.5 hover:shadow-lift">
                <div className="h-24 w-24 flex-none overflow-hidden rounded-xl bg-ink-100">
                  {l.primaryPhotoKey && photoUrl(l.primaryPhotoKey) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={photoUrl(l.primaryPhotoKey)!} alt="" className="h-full w-full object-cover" />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="truncate font-serif text-lg text-ink-900">{l.title || "Untitled"}</h2>
                    <StatusBadge status={l.status} />
                  </div>
                  <p className="mt-0.5 text-sm text-ink-500">
                    {l.neighborhood} · {formatCategory(l.category)} · {isSale ? "For sale" : "For rent"}
                  </p>
                  <p className="mt-1.5 font-serif text-lg font-semibold text-ink-900">
                    {isSale
                      ? (l.salePriceKes != null ? formatKesFull(l.salePriceKes) : "Price on request")
                      : <>{formatKes(l.rentKesCents)}<span className="text-sm font-normal text-ink-500">/mo</span></>}
                  </p>
                  {l.fraudScore >= 60 && (
                    <p className="mt-1 text-xs text-red-700">⚠ Risk score {l.fraudScore} — review before publishing</p>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
