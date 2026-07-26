import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { countyBySlug, type County } from "@/lib/locations";
import ListingResultCard, { type ListingCardItem } from "@/components/ListingResultCard";

// Render on demand + ISR: keeps `next build` hermetic (no API needed at build)
// while still serving fast, cached, crawlable pages in production.
export const revalidate = 1800;

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

async function fetchListings(county: string, type: "RENT" | "SALE"): Promise<ListingCardItem[]> {
  try {
    const res = await fetch(
      `${API}/v1/listings?county=${encodeURIComponent(county)}&listingType=${type}&limit=24`,
      { next: { revalidate: 900 } },
    );
    if (!res.ok) return [];
    const data = (await res.json()) as { items: ListingCardItem[] };
    return data.items ?? [];
  } catch {
    return [];
  }
}

export function generateMetadata({ params }: { params: { county: string } }): Metadata {
  const c = countyBySlug(params.county);
  if (!c) return { title: "Homes in Kenya | Nuru" };
  const areas = c.areas.slice(0, 5).join(", ");
  return {
    title: `Homes for rent & for sale in ${c.county} | Nuru`,
    description: `Verified rentals and homes for sale in ${c.county}${areas ? ` — ${areas} and more` : ""}. Conversational search, M-Pesa escrow, no bait listings.`,
    alternates: { canonical: `/homes/${c.slug}` },
    openGraph: {
      title: `Homes in ${c.county} — Nuru`,
      description: `Verified rentals and homes for sale across ${c.county}, Kenya.`,
    },
  };
}

export default async function CountyPage({ params }: { params: { county: string } }) {
  const county: County | undefined = countyBySlug(params.county);
  if (!county) notFound();

  const [rentals, sales] = await Promise.all([
    fetchListings(county.county, "RENT"),
    fetchListings(county.county, "SALE"),
  ]);
  const total = rentals.length + sales.length;

  return (
    <div className="mx-auto max-w-6xl space-y-12 px-1 py-2">
      <header>
        <nav className="text-sm text-ink-400">
          <Link href="/locations" className="hover:text-ink-700">Locations</Link>
          <span className="mx-1.5">/</span>
          <span className="text-ink-600">{county.county}</span>
        </nav>
        <p className="mt-4 font-sans text-xs font-semibold uppercase tracking-[0.16em] text-brand-700">{county.region}</p>
        <h1 className="mt-2 font-serif text-4xl leading-tight text-ink-900 sm:text-5xl">
          Homes in {county.county}
        </h1>
        <p className="mt-3 max-w-prose text-lg leading-8 text-ink-600">
          Verified rentals and homes for sale across {county.county} County.
          {total > 0 ? ` ${total} listing${total === 1 ? "" : "s"} live now.` : ""}
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          {county.areas.slice(0, 10).map((area) => (
            <Link
              key={area}
              href={`/search?q=${encodeURIComponent(area)}`}
              className="rounded-full border border-ink-200 bg-surface px-3.5 py-1.5 text-sm text-ink-700 transition hover:border-ink-300 hover:text-ink-900"
            >
              {area}
            </Link>
          ))}
        </div>
      </header>

      <Section
        title={`For rent in ${county.county}`}
        cta={{ href: `/search?q=${encodeURIComponent(county.county)}&type=RENT`, label: "All rentals →" }}
        items={rentals}
        empty={`No rentals listed in ${county.county} yet. Set up a saved search and we'll alert you.`}
      />

      <Section
        title={`For sale in ${county.county}`}
        cta={{ href: `/search?q=${encodeURIComponent(county.county)}&type=SALE`, label: "All homes for sale →" }}
        items={sales}
        empty={`No homes for sale in ${county.county} yet — check back soon.`}
      />
    </div>
  );
}

function Section({
  title, cta, items, empty,
}: {
  title: string;
  cta: { href: string; label: string };
  items: ListingCardItem[];
  empty: string;
}) {
  return (
    <section className="space-y-5">
      <div className="flex items-end justify-between gap-3">
        <h2 className="font-serif text-2xl text-ink-900">{title}</h2>
        {items.length > 0 && (
          <Link href={cta.href} className="whitespace-nowrap text-sm font-medium text-brand-700 hover:text-brand-800">
            {cta.label}
          </Link>
        )}
      </div>
      {items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-ink-200 p-8 text-center text-ink-500">{empty}</p>
      ) : (
        <div className="grid gap-4">
          {items.map((item) => (
            <ListingResultCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </section>
  );
}
