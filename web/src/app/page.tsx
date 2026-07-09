"use client";

import Link from "next/link";
import { useI18n } from "@/lib/i18n";

// Example queries stay verbatim; they demonstrate that search accepts
// EN/Swahili/Sheng regardless of the UI language.
const EXAMPLE_QUERIES = [
  "2BR Kilimani under 60K with parking",
  "natafuta keja Kile na pet zangu, around 80k",
  "quiet family-friendly Lavington max 120k",
];

export default function HomePage() {
  const { t } = useI18n();
  return (
    <div className="space-y-10">
      <section
        className="relative min-h-[520px] overflow-hidden rounded-lg bg-ink-900"
        style={{
          backgroundImage:
            "linear-gradient(90deg, rgba(17,24,39,.88) 0%, rgba(17,24,39,.72) 40%, rgba(17,24,39,.18) 72%), url('/hero-nairobi-rental.jpg')",
          backgroundPosition: "center",
          backgroundSize: "cover",
        }}
      >
        <div className="flex min-h-[520px] max-w-3xl flex-col justify-center px-5 py-10 text-white sm:px-10">
          <div className="mb-5 inline-flex w-fit items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-sm font-medium ring-1 ring-white/20">
            <span className="h-2 w-2 rounded-full bg-green-300" aria-hidden="true" />
            Verified Nairobi rentals with escrow protection
          </div>
          <h1 className="max-w-2xl text-4xl font-bold leading-tight sm:text-5xl">
            {t("home.heroTitle")}
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-white/90 sm:text-lg">
            {t("home.heroSub")}
          </p>

          <form action="/search" className="mt-8 max-w-2xl">
            <div className="mb-2 flex w-fit overflow-hidden rounded-md border border-white/28 bg-white/12 text-sm font-semibold">
              <span className="bg-white px-4 py-2 text-ink-900">Rent</span>
              <Link href="/agent" className="px-4 py-2 text-white hover:bg-white/10">
                List property
              </Link>
            </div>
            <div className="flex flex-col gap-3 rounded-lg bg-white p-2 shadow-xl shadow-ink-900/25 sm:flex-row">
              <label className="sr-only" htmlFor="home-search">Search rentals</label>
              <input
                id="home-search"
                name="q"
                placeholder={t("home.searchPlaceholder")}
                className="min-h-12 flex-1 rounded-md border border-transparent bg-white px-4 text-base text-ink-900 outline-none focus:border-brand-300 focus:ring-2 focus:ring-brand-200"
                autoFocus
              />
              <button
                type="submit"
                className="min-h-12 rounded-md bg-brand-500 px-6 font-semibold text-white shadow-sm hover:bg-brand-600"
              >
                {t("home.search")}
              </button>
            </div>
          </form>

          <div className="mt-4 flex flex-wrap gap-2 text-sm text-white/80">
            <span className="py-1">{t("home.try")}</span>
            {EXAMPLE_QUERIES.map((q) => (
              <Link
                key={q}
                href={`/search?q=${encodeURIComponent(q)}`}
                className="rounded-full bg-white/10 px-3 py-1 ring-1 ring-white/20 hover:bg-white/20"
              >
                {q}
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-3 rounded-lg border border-ink-200 bg-surface p-3 sm:grid-cols-3">
        <Metric label="Search in EN, Swahili, or Sheng" value="AI" />
        <Metric label="Deposit held until move-in" value="Escrow" />
        <Metric label="Launch focus areas in Nairobi" value="5" />
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <Card eyebrow="Checked before publish" title={t("home.f1t")} body={t("home.f1b")} />
        <Card eyebrow="No cash guesswork" title={t("home.f2t")} body={t("home.f2b")} />
        <Card eyebrow="Built for Nairobi" title={t("home.f3t")} body={t("home.f3b")} />
      </section>

      <section className="grid gap-6 border-y border-ink-200 py-8 lg:grid-cols-[1.25fr,.75fr]">
        <div>
          <p className="text-sm font-semibold uppercase text-brand-700">For tenants</p>
          <h2 className="mt-2 text-2xl font-semibold">Search like you would ask a trusted agent.</h2>
          <p className="mt-3 max-w-2xl text-ink-600">
            Ask for location, budget, bedrooms, commute, parking, pets, water, or security in one sentence.
            Save a search and Nuru alerts you when a matching listing goes live.
          </p>
        </div>
        <div className="rounded-lg border border-ink-200 bg-surface p-5">
          <h3 className="font-semibold">{t("home.agentTitle")}</h3>
          <p className="mt-2 text-sm leading-6 text-ink-600">{t("home.agentBody")}</p>
          <Link href="/agent" className="mt-4 inline-flex rounded-md bg-ink-900 px-4 py-2 font-semibold text-white hover:bg-ink-800">
            {t("home.getStarted")}
          </Link>
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-ink-50 px-4 py-3">
      <p className="text-xl font-bold text-ink-900">{value}</p>
      <p className="mt-1 text-sm text-ink-600">{label}</p>
    </div>
  );
}

function Card({ eyebrow, title, body }: { eyebrow: string; title: string; body: string }) {
  return (
    <div className="rounded-lg border border-ink-200 bg-surface p-5">
      <p className="text-xs font-semibold uppercase text-brand-700">{eyebrow}</p>
      <h3 className="mt-2 font-semibold">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-ink-600">{body}</p>
    </div>
  );
}
