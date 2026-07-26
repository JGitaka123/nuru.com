import type { Metadata } from "next";
import Link from "next/link";
import { countiesByRegion, FEATURED_MARKETS, countyBySlug } from "@/lib/locations";

export const metadata: Metadata = {
  title: "Browse homes by location across Kenya | Nuru",
  description:
    "Find verified rentals and homes for sale in every Kenyan county — Nairobi, Mombasa, Kisumu, Nakuru, Eldoret and beyond.",
  alternates: { canonical: "/locations" },
};

// Slug lookup for the featured cards (which carry county name, not slug).
function slugFor(countyName: string): string {
  const match = countiesByRegion()
    .flatMap((g) => g.counties)
    .find((c) => c.county === countyName);
  return match?.slug ?? countyName.toLowerCase().replace(/\s+/g, "-");
}

export default function LocationsPage() {
  const groups = countiesByRegion();

  return (
    <div className="mx-auto max-w-6xl space-y-14 px-1 py-2">
      <header>
        <p className="font-sans text-xs font-semibold uppercase tracking-[0.16em] text-brand-700">Nationwide</p>
        <h1 className="mt-2 font-serif text-4xl leading-tight text-ink-900 sm:text-5xl">Homes across Kenya</h1>
        <p className="mt-3 max-w-prose text-lg leading-8 text-ink-600">
          Nuru covers all 47 counties. Pick a market to see verified rentals and homes for sale.
        </p>
      </header>

      {/* Featured markets */}
      <section className="space-y-5">
        <h2 className="font-serif text-2xl text-ink-900">Popular markets</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURED_MARKETS.map((m) => (
            <Link
              key={m.name}
              href={`/homes/${countyBySlug(slugFor(m.county))?.slug ?? slugFor(m.county)}`}
              className="group flex items-center justify-between gap-3 rounded-2xl border border-ink-200 bg-surface p-5 shadow-card transition hover:-translate-y-0.5 hover:shadow-lift"
            >
              <span className="min-w-0">
                <span className="block font-serif text-xl text-ink-900">{m.name}</span>
                <span className="mt-0.5 block truncate text-sm text-ink-500">{m.blurb}</span>
              </span>
              <span aria-hidden="true" className="text-brand-500 transition group-hover:translate-x-0.5">→</span>
            </Link>
          ))}
        </div>
      </section>

      {/* All counties by region */}
      {groups.map((group) => (
        <section key={group.region} className="space-y-4">
          <h2 className="font-serif text-xl text-ink-900">{group.region}</h2>
          <div className="flex flex-wrap gap-2">
            {group.counties.map((c) => (
              <Link
                key={c.slug}
                href={`/homes/${c.slug}`}
                className="rounded-full border border-ink-200 bg-surface px-4 py-2 text-sm text-ink-700 transition hover:border-ink-300 hover:text-ink-900"
              >
                {c.county}
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
