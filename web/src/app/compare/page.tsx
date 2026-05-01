"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { api, type Listing } from "@/lib/api";
import { formatKes, formatCategory, photoUrl } from "@/lib/format";

const FEATURE_KEYS = [
  "parking", "balcony", "borehole", "backup_generator", "lift", "gym",
  "swimming_pool", "garden", "cctv", "gated_compound", "fibre_internet",
  "fitted_kitchen", "pet_friendly", "furnished",
];

export default function ComparePage() {
  const router = useRouter();
  const params = useSearchParams();
  const ids = useMemo(() => (params.get("ids") ?? "").split(",").filter(Boolean).slice(0, 4), [params]);

  const [items, setItems] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (ids.length === 0) { setLoading(false); return; }
    Promise.all(ids.map((id) => api<Listing>(`/v1/listings/${id}`, { auth: false }).catch(() => null)))
      .then((rs) => setItems(rs.filter((r): r is Listing => r !== null)))
      .finally(() => setLoading(false));
  }, [ids]);

  function remove(id: string) {
    const next = ids.filter((x) => x !== id).join(",");
    router.push(next ? `/compare?ids=${next}` : "/search");
  }

  if (loading) return <div className="text-ink-500">Loading…</div>;
  if (items.length === 0) {
    return (
      <div className="rounded-xl bg-white p-8 text-center">
        <p>No listings to compare. Add up to 4 from search results.</p>
        <Link href="/search" className="mt-3 inline-block rounded-md bg-brand-500 px-4 py-2 font-semibold text-white">Browse listings</Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold">Compare {items.length} listing{items.length === 1 ? "" : "s"}</h1>

      <div className="overflow-x-auto">
        <table className="min-w-full bg-white text-sm ring-1 ring-ink-200">
          <thead>
            <tr>
              <th className="w-40 bg-ink-50 px-3 py-2 text-left text-xs uppercase tracking-wide text-ink-500"></th>
              {items.map((l) => (
                <th key={l.id} className="border-l border-ink-100 px-3 py-3 text-left">
                  {l.primaryPhotoKey && photoUrl(l.primaryPhotoKey) && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={photoUrl(l.primaryPhotoKey)!} alt="" className="mb-2 h-28 w-full rounded-lg object-cover" />
                  )}
                  <Link href={`/listing/${l.id}`} className="block font-semibold hover:text-brand-600">{l.title}</Link>
                  <button onClick={() => remove(l.id)} className="mt-1 text-xs text-ink-500 hover:text-red-600">Remove</button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <Row label="Neighborhood" cells={items.map((l) => l.neighborhood)} />
            <Row label="Category" cells={items.map((l) => formatCategory(l.category))} />
            <Row label="Bedrooms" cells={items.map((l) => l.bedrooms)} />
            <Row label="Bathrooms" cells={items.map((l) => l.bathrooms)} />
            <Row label="Rent" cells={items.map((l) => `${formatKes(l.rentKesCents)}/mo`)} highlight />
            <Row label="Deposit" cells={items.map((l) => `${l.depositMonths} mo`)} />
            <Row label="Verified" cells={items.map((l) => l.verificationStatus === "VERIFIED" ? "✓" : "—")} />
            {FEATURE_KEYS.map((f) => (
              <Row key={f} label={f.replace(/_/g, " ")} cells={items.map((l) => l.features.includes(f) ? "✓" : "—")} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Row({ label, cells, highlight }: { label: string; cells: Array<string | number>; highlight?: boolean }) {
  return (
    <tr className={`border-t border-ink-100 ${highlight ? "bg-brand-50/40" : ""}`}>
      <th scope="row" className="bg-ink-50 px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-ink-600">{label}</th>
      {cells.map((c, i) => (
        <td key={i} className="border-l border-ink-100 px-3 py-2 capitalize">{c}</td>
      ))}
    </tr>
  );
}
