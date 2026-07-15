"use client";

import { useState } from "react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";

// Example queries stay verbatim; they show search accepts EN/Swahili/Sheng.
const RENT_EXAMPLES = [
  "2BR Kilimani under 60K with parking",
  "natafuta keja Kile na pet zangu, around 80k",
  "quiet family-friendly Lavington max 120k",
];
const SALE_EXAMPLES = [
  "4 bedroom house for sale in Lavington",
  "3BR apartment to buy in Kilimani",
  "land for sale in Karen",
];

export default function HomePage() {
  const { t } = useI18n();
  const [mode, setMode] = useState<"RENT" | "SALE">("RENT");
  const examples = mode === "SALE" ? SALE_EXAMPLES : RENT_EXAMPLES;

  return (
    <div className="space-y-20">
      {/* Hero */}
      <section className="relative -mx-4 -mt-6 overflow-hidden sm:-mx-6 sm:mt-0 sm:rounded-3xl">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: "url('/hero-nairobi-rental.jpg')" }}
          aria-hidden="true"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-ink-900/90 via-ink-900/70 to-ink-900/25" aria-hidden="true" />
        <div className="relative mx-auto flex min-h-[560px] max-w-6xl flex-col justify-center px-6 py-16 sm:px-10">
          <div className="mb-6 inline-flex w-fit items-center gap-2 rounded-full bg-white/10 px-3.5 py-1.5 text-sm font-medium text-white/90 ring-1 ring-white/20 backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" aria-hidden="true" />
            Verified homes · M-Pesa escrow protection
          </div>
          <h1 className="max-w-3xl font-serif text-[2.75rem] font-semibold leading-[1.05] tracking-tightish text-white sm:text-6xl">
            {mode === "SALE" ? "Own your next home in Nairobi." : t("home.heroTitle")}
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-8 text-white/85">
            {mode === "SALE"
              ? "Browse verified homes for sale across Nairobi's best neighborhoods — no bait listings, no guesswork."
              : t("home.heroSub")}
          </p>

          {/* Search card */}
          <form action="/search" className="mt-9 max-w-2xl">
            <input type="hidden" name="type" value={mode} />
            <div className="mb-3 inline-flex rounded-full bg-white/12 p-1 text-sm font-medium ring-1 ring-white/20 backdrop-blur">
              {(["RENT", "SALE"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`rounded-full px-5 py-1.5 transition ${mode === m ? "bg-white text-ink-900" : "text-white/85 hover:text-white"}`}
                >
                  {m === "RENT" ? "Rent" : "Buy"}
                </button>
              ))}
            </div>
            <div className="flex flex-col gap-2 rounded-2xl bg-white p-2 shadow-2xl shadow-ink-900/30 sm:flex-row">
              <label className="sr-only" htmlFor="home-search">Search homes</label>
              <input
                id="home-search"
                name="q"
                placeholder={mode === "SALE" ? "House for sale in Lavington" : t("home.searchPlaceholder")}
                className="min-h-[3.25rem] flex-1 rounded-xl border border-transparent bg-white px-4 text-base text-ink-900 outline-none focus:ring-2 focus:ring-brand-300"
              />
              <button type="submit" className="min-h-[3.25rem] rounded-xl bg-brand-500 px-7 font-medium text-white transition hover:bg-brand-600">
                {t("home.search")}
              </button>
            </div>
            <div className="mt-4 flex flex-wrap gap-2 text-sm text-white/75">
              <span className="py-1">{t("home.try")}</span>
              {examples.map((q) => (
                <Link key={q} href={`/search?q=${encodeURIComponent(q)}&type=${mode}`}
                  className="rounded-full bg-white/10 px-3 py-1 ring-1 ring-white/15 backdrop-blur transition hover:bg-white/20">
                  {q}
                </Link>
              ))}
            </div>
          </form>
        </div>
      </section>

      {/* Value props */}
      <section className="mx-auto max-w-6xl px-1">
        <div className="grid gap-px overflow-hidden rounded-2xl border border-ink-200 bg-ink-200 sm:grid-cols-3">
          <Feature eyebrow="Checked before publish" title={t("home.f1t")} body={t("home.f1b")} />
          <Feature eyebrow="No cash guesswork" title={t("home.f2t")} body={t("home.f2b")} />
          <Feature eyebrow="Built for Nairobi" title={t("home.f3t")} body={t("home.f3b")} />
        </div>
      </section>

      {/* Editorial split — tenants */}
      <section className="mx-auto grid max-w-6xl gap-10 px-1 lg:grid-cols-[1.1fr_.9fr] lg:items-center">
        <div>
          <p className="font-sans text-xs font-semibold uppercase tracking-[0.16em] text-brand-700">For tenants & buyers</p>
          <h2 className="mt-3 font-serif text-3xl leading-tight text-ink-900 sm:text-4xl">
            Search like you'd ask a trusted agent.
          </h2>
          <p className="mt-4 max-w-prose text-lg leading-8 text-ink-600">
            Ask for location, budget, bedrooms, commute, parking, pets, water or security — in one sentence,
            in English, Swahili or Sheng. Save a search and Nuru alerts you the moment a matching verified home goes live.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/search" className="rounded-xl bg-ink-900 px-5 py-3 font-medium text-ink-50 transition hover:bg-ink-800">Browse rentals</Link>
            <Link href="/search?type=SALE" className="rounded-xl border border-ink-300 px-5 py-3 font-medium text-ink-800 transition hover:border-ink-400">Homes for sale</Link>
          </div>
        </div>
        <div className="rounded-2xl border border-ink-200 bg-surface p-7 shadow-card">
          <p className="font-sans text-xs font-semibold uppercase tracking-[0.16em] text-brand-700">{t("home.agentTitle")}</p>
          <h3 className="mt-3 font-serif text-2xl text-ink-900">List a property in 60 seconds</h3>
          <p className="mt-3 leading-7 text-ink-600">{t("home.agentBody")}</p>
          <Link href="/agent" className="mt-6 inline-flex rounded-xl bg-brand-500 px-5 py-3 font-medium text-white transition hover:bg-brand-600">
            {t("home.getStarted")}
          </Link>
        </div>
      </section>
    </div>
  );
}

function Feature({ eyebrow, title, body }: { eyebrow: string; title: string; body: string }) {
  return (
    <div className="bg-surface p-7">
      <p className="font-sans text-xs font-semibold uppercase tracking-[0.14em] text-brand-700">{eyebrow}</p>
      <h3 className="mt-3 font-serif text-xl text-ink-900">{title}</h3>
      <p className="mt-2.5 leading-7 text-ink-600">{body}</p>
    </div>
  );
}
