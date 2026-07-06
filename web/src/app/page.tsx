"use client";

import Link from "next/link";
import { useI18n } from "@/lib/i18n";

// Example queries stay verbatim — they demonstrate that search accepts
// EN/Swahili/Sheng regardless of the UI language.
const EXAMPLE_QUERIES = [
  "2BR Kilimani under 60K with parking",
  "natafuta keja Kile na pet zangu, around 80k",
  "quiet family-friendly Lavington max 120k",
];

export default function HomePage() {
  const { t } = useI18n();
  return (
    <div className="space-y-12">
      <section className="rounded-2xl bg-surface p-8 shadow-sm sm:p-12">
        <h1 className="text-3xl font-bold sm:text-5xl">{t("home.heroTitle")}</h1>
        <p className="mt-4 max-w-xl text-lg text-ink-600">{t("home.heroSub")}</p>
        <form action="/search" className="mt-8 flex flex-col gap-3 sm:flex-row">
          <input
            name="q"
            placeholder={t("home.searchPlaceholder")}
            className="flex-1 rounded-lg border border-ink-200 bg-surface px-4 py-3 text-base shadow-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200"
            autoFocus
          />
          <button
            type="submit"
            className="rounded-lg bg-brand-500 px-6 py-3 font-semibold text-white shadow-sm hover:bg-brand-600"
          >
            {t("home.search")}
          </button>
        </form>
        <div className="mt-4 flex flex-wrap gap-2 text-sm text-ink-500">
          <span>{t("home.try")}</span>
          {EXAMPLE_QUERIES.map((q) => (
            <Link key={q} href={`/search?q=${encodeURIComponent(q)}`} className="rounded-full bg-ink-100 px-3 py-1 hover:bg-ink-200">
              {q}
            </Link>
          ))}
        </div>
      </section>

      <section className="grid gap-6 sm:grid-cols-3">
        <Card title={t("home.f1t")} body={t("home.f1b")} />
        <Card title={t("home.f2t")} body={t("home.f2b")} />
        <Card title={t("home.f3t")} body={t("home.f3b")} />
      </section>

      <section className="rounded-2xl bg-brand-50 p-8 ring-1 ring-brand-100 dark:bg-brand-900/20 dark:ring-brand-900/40">
        <h2 className="text-2xl font-semibold">{t("home.agentTitle")}</h2>
        <p className="mt-2 text-ink-700">{t("home.agentBody")}</p>
        <Link href="/agent" className="mt-4 inline-block rounded-md bg-brand-500 px-4 py-2 font-semibold text-white hover:bg-brand-600">
          {t("home.getStarted")}
        </Link>
      </section>
    </div>
  );
}

function Card({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-ink-200 bg-surface p-6">
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-ink-600">{body}</p>
    </div>
  );
}
