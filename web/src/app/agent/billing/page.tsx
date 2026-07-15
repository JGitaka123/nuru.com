"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { api, getToken } from "@/lib/api";
import { toast } from "@/components/Toast";
import { PageHeading, Panel, StatusBadge } from "@/components/ui";

interface Plan {
  id: string;
  name: string;
  monthlyKesCents: number;
  maxActiveListings: number | null;
  blurb: string;
  rank: number;
}

interface Subscription {
  id: string;
  planTier: "TRIAL" | "BRONZE" | "SILVER" | "GOLD" | "PLATINUM";
  status: string;
  trialEndsAt: string | null;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  failedAttempts: number;
  plan: Plan;
  invoices: Array<{
    id: string;
    amountKesCents: number;
    status: string;
    dueAt: string;
    paidAt: string | null;
    mpesaReceipt: string | null;
  }>;
}

function AgentBillingPageInner() {
  const router = useRouter();
  const params = useSearchParams();
  const desiredPlan = params.get("plan");
  const [sub, setSub] = useState<Subscription | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [promo, setPromo] = useState("");

  useEffect(() => {
    if (!getToken()) { router.push("/login?next=/agent/billing"); return; }
    Promise.all([
      api<Subscription>("/v1/billing/me"),
      api<{ plans: Plan[] }>("/v1/billing/plans", { auth: false }),
    ])
      .then(([s, p]) => { setSub(s); setPlans(p.plans.sort((a, b) => a.rank - b.rank)); })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Failed"))
      .finally(() => setLoading(false));
  }, [router]);

  async function changePlan(tier: string) {
    setBusy(tier);
    try {
      const updated = await api<Subscription>("/v1/billing/change-plan", {
        method: "POST",
        body: { planTier: tier, promoCode: promo || undefined },
      });
      setSub(updated);
      if (updated.invoices.some((i) => i.status === "OPEN" || i.status === "PROCESSING")) {
        toast.success(`We've sent an M-Pesa prompt for the ${tier} plan. Check your phone.`);
      } else {
        toast.success(`Switched to ${tier}.`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  async function cancel() {
    if (!confirm("Cancel at the end of the current period? Your listings stay live until then.")) return;
    setBusy("cancel");
    try {
      const updated = await api<Subscription>("/v1/billing/cancel", { method: "POST" });
      setSub(updated);
      toast.info("Subscription will end at period close.");
    } finally {
      setBusy(null);
    }
  }

  async function retry() {
    setBusy("retry");
    try {
      await api("/v1/billing/retry", { method: "POST" });
      toast.success("Retry initiated — check your phone for the M-Pesa prompt.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <div className="text-ink-500">Loading…</div>;
  if (!sub) return <div className="text-ink-500">No subscription found.</div>;

  const trialDaysLeft = sub.trialEndsAt
    ? Math.max(0, Math.ceil((new Date(sub.trialEndsAt).getTime() - Date.now()) / 86_400_000))
    : null;

  return (
    <div className="space-y-8">
      <PageHeading eyebrow="Agent workspace" title="Billing" />

      <Panel>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-sans text-xs font-medium uppercase tracking-[0.12em] text-ink-400">Current plan</p>
            <p className="mt-1 font-serif text-2xl font-semibold text-ink-900">{sub.plan.name}</p>
          </div>
          <StatusBadge status={sub.status} />
        </div>

        {sub.status === "TRIALING" && trialDaysLeft !== null && (
          <p className="mt-2 text-sm">Trial: <strong>{trialDaysLeft} day{trialDaysLeft === 1 ? "" : "s"}</strong> remaining.</p>
        )}
        {sub.status === "PAST_DUE" && (
          <div className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">
            Payment failed ({sub.failedAttempts} attempt{sub.failedAttempts === 1 ? "" : "s"}).
            <button onClick={retry} disabled={busy === "retry"} className="ml-2 rounded bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50">
              Retry now
            </button>
          </div>
        )}
        {sub.cancelAtPeriodEnd && (
          <p className="mt-2 text-xs text-amber-700">Cancels on {new Date(sub.currentPeriodEnd).toLocaleDateString("en-KE")}</p>
        )}
        {!sub.cancelAtPeriodEnd && sub.planTier !== "TRIAL" && (
          <button onClick={cancel} disabled={busy === "cancel"} className="mt-3 text-xs text-red-600 hover:underline disabled:opacity-50">
            Cancel at period end
          </button>
        )}
      </Panel>

      <section className="space-y-3">
        <h2 className="font-serif text-xl text-ink-900">Choose a plan</h2>
        <div className="flex items-center gap-3">
          <input
            placeholder="Promo code (optional)"
            value={promo}
            onChange={(e) => setPromo(e.target.value.toUpperCase())}
            className="rounded-xl border border-ink-200 bg-surface px-3 py-2 text-sm"
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {plans.filter((p) => p.id !== "TRIAL").map((p) => {
            const isCurrent = sub.planTier === p.id;
            const desired = desiredPlan === p.id;
            return (
              <article key={p.id} className={`rounded-2xl border bg-surface p-5 shadow-card ${desired ? "border-brand-500 ring-1 ring-brand-500" : "border-ink-200"}`}>
                <h3 className="font-serif text-lg text-ink-900">{p.name}</h3>
                <p className="text-sm text-ink-500">{p.blurb}</p>
                <p className="mt-2 font-serif text-2xl font-semibold text-ink-900">KES {(p.monthlyKesCents / 100).toLocaleString("en-KE")}<span className="text-sm font-normal text-ink-500">/mo</span></p>
                <p className="text-xs text-ink-500">{p.maxActiveListings === null ? "Unlimited" : p.maxActiveListings} listings</p>
                <button
                  disabled={busy === p.id || isCurrent}
                  onClick={() => changePlan(p.id)}
                  className={`mt-3 w-full rounded-xl py-2 text-sm font-semibold ${isCurrent ? "bg-ink-100 text-ink-500" : "bg-brand-500 text-white hover:bg-brand-600"} disabled:opacity-50`}
                >
                  {isCurrent ? "Current" : busy === p.id ? "Initiating…" : "Switch to " + p.name}
                </button>
              </article>
            );
          })}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-serif text-xl text-ink-900">Invoices</h2>
        {sub.invoices.length === 0 ? (
          <p className="text-ink-500">No invoices yet.</p>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-ink-200 shadow-card">
            <table className="w-full bg-surface text-sm">
              <thead className="border-b border-ink-100 text-left text-xs font-medium uppercase tracking-wide text-ink-400">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Receipt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {sub.invoices.map((i) => (
                  <tr key={i.id}>
                    <td className="px-4 py-3">{new Date(i.dueAt).toLocaleDateString("en-KE")}</td>
                    <td className="px-4 py-3">KES {(i.amountKesCents / 100).toLocaleString("en-KE")}</td>
                    <td className="px-4 py-3">{i.status}</td>
                    <td className="px-4 py-3 text-ink-500">{i.mpesaReceipt ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

// useSearchParams() must render inside a Suspense boundary for static export.
export default function AgentBillingPage() {
  return (
    <Suspense>
      <AgentBillingPageInner />
    </Suspense>
  );
}
