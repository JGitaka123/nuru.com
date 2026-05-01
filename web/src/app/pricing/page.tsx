import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pricing — Nuru",
  description: "Free 30-day trial, then choose Bronze, Silver, Gold, or Platinum. M-Pesa monthly billing, no hidden fees.",
};

export const revalidate = 3600;

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

interface PlanDef {
  id: string;
  name: string;
  monthlyKesCents: number;
  yearlyKesCents: number | null;
  maxActiveListings: number | null;
  blurb: string;
  rank: number;
  features: Record<string, boolean | number>;
}

const FEATURE_LABELS: Array<[string, string]> = [
  ["aiListingGeneration", "AI listing generation"],
  ["basicAnalytics", "Basic analytics"],
  ["fullAnalytics", "Full analytics + per-listing insights"],
  ["prioritySearchRank", "Priority search rank"],
  ["whatsappAutoreply", "WhatsApp autoreply"],
  ["featuredPlacement", "Featured placement"],
  ["dedicatedAiAssistant", "Dedicated AI assistant"],
  ["brandedLandingPage", "Branded landing page"],
  ["bulkListingTools", "Bulk listing tools"],
  ["apiAccess", "API access"],
  ["accountManager", "Account manager"],
  ["customPromptTraining", "Custom prompt training"],
  ["whiteLabel", "White-label"],
];

async function fetchPlans(): Promise<PlanDef[]> {
  try {
    const res = await fetch(`${API}/v1/billing/plans`, { next: { revalidate: 3600 } });
    if (!res.ok) return [];
    const data = (await res.json()) as { plans: PlanDef[] };
    return data.plans.sort((a, b) => a.rank - b.rank);
  } catch {
    return [];
  }
}

export default async function PricingPage() {
  const plans = await fetchPlans();

  return (
    <div className="space-y-10">
      <header className="text-center">
        <h1 className="text-4xl font-bold sm:text-5xl">Simple, fair pricing</h1>
        <p className="mt-3 text-lg text-ink-600">Free for 30 days. Pay only when you're getting value. M-Pesa monthly billing.</p>
      </header>

      <section className="grid gap-4 lg:grid-cols-5">
        {plans.map((p) => {
          const monthly = (p.monthlyKesCents / 100).toLocaleString("en-KE");
          const featured = p.id === "SILVER";
          return (
            <article
              key={p.id}
              className={`flex flex-col rounded-2xl bg-white p-6 ring-1 ${featured ? "ring-2 ring-brand-500" : "ring-ink-200"}`}
            >
              {featured && <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand-600">Most popular</p>}
              <h2 className="text-xl font-bold">{p.name}</h2>
              <p className="mt-1 text-sm text-ink-500">{p.blurb}</p>
              <p className="mt-4 text-3xl font-bold">
                {p.id === "TRIAL" ? "Free" : (
                  <>
                    KES {monthly}
                    <span className="text-base font-normal text-ink-500">/mo</span>
                  </>
                )}
              </p>
              {p.yearlyKesCents && (
                <p className="text-xs text-ink-500">or KES {(p.yearlyKesCents / 100).toLocaleString("en-KE")}/year (2 months free)</p>
              )}
              <p className="mt-3 text-sm">
                <strong>{p.maxActiveListings === null ? "Unlimited" : p.maxActiveListings}</strong> active listings
              </p>
              <ul className="mt-4 space-y-1.5 text-sm">
                {FEATURE_LABELS.map(([key, label]) => {
                  const enabled = !!p.features[key];
                  if (!enabled && p.id === "TRIAL") return null;       // trial has very few — keep card short
                  if (!enabled) return null;
                  return (
                    <li key={key} className="flex gap-2 text-ink-700">
                      <span className="text-green-600" aria-hidden="true">✓</span>
                      <span>{label}</span>
                    </li>
                  );
                })}
              </ul>
              <Link
                href={p.id === "TRIAL" ? "/login" : `/agent/billing?plan=${p.id}`}
                className={`mt-6 block rounded-lg py-2.5 text-center font-semibold ${featured ? "bg-brand-500 text-white hover:bg-brand-600" : "border border-ink-300 hover:bg-ink-50"}`}
              >
                {p.id === "TRIAL" ? "Start free trial" : "Choose " + p.name}
              </Link>
            </article>
          );
        })}
      </section>

      <section className="mx-auto max-w-3xl space-y-3 text-sm text-ink-700">
        <h2 className="text-xl font-semibold">Frequently asked</h2>
        <details className="rounded-lg bg-white p-4 ring-1 ring-ink-200">
          <summary className="cursor-pointer font-medium">What happens after my trial ends?</summary>
          <p className="mt-2">Your listings pause until you pick a plan. Re-activating is one click — listings come right back.</p>
        </details>
        <details className="rounded-lg bg-white p-4 ring-1 ring-ink-200">
          <summary className="cursor-pointer font-medium">How do I pay?</summary>
          <p className="mt-2">M-Pesa STK push to your phone each month. We send a reminder SMS the day before each charge.</p>
        </details>
        <details className="rounded-lg bg-white p-4 ring-1 ring-ink-200">
          <summary className="cursor-pointer font-medium">Can I change plans later?</summary>
          <p className="mt-2">Yes — upgrade or downgrade any time. Changes take effect at the next billing cycle, prorated.</p>
        </details>
        <details className="rounded-lg bg-white p-4 ring-1 ring-ink-200">
          <summary className="cursor-pointer font-medium">Is there a long-term contract?</summary>
          <p className="mt-2">No. Monthly billing, cancel any time before the next charge.</p>
        </details>
      </section>
    </div>
  );
}
