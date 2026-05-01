"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, getToken } from "@/lib/api";
import { toast } from "@/components/Toast";

interface Data {
  code: { id: string; code: string; redemptions: number; rewardFreeMonths: number; redeemerDiscountPct: number };
  redemptions: Array<{ id: string; redeemedAt: string; rewardPaidAt: string | null }>;
}

export default function ReferralsPage() {
  const router = useRouter();
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getToken()) { router.push("/login"); return; }
    api<Data>("/v1/referrals/me").then(setData).finally(() => setLoading(false));
  }, [router]);

  async function copy(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      toast.success("Code copied");
    } catch {
      toast.error("Copy failed — long-press to copy manually");
    }
  }

  function shareUrl(code: string) {
    const base = typeof window !== "undefined" ? window.location.origin : "https://nuru.com";
    return `${base}/?ref=${code}`;
  }

  if (loading) return <div className="text-ink-500">Loading…</div>;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Refer & earn</h1>
        <p className="mt-1 text-ink-600">
          Share your code. When someone signs up and pays for their first month,
          you get <strong>{data.code.rewardFreeMonths} free month{data.code.rewardFreeMonths === 1 ? "" : "s"}</strong> on
          your plan, and they get <strong>{data.code.redeemerDiscountPct}% off</strong> their first month.
        </p>
      </div>

      <section className="rounded-xl bg-white p-6 ring-1 ring-ink-200">
        <p className="text-sm text-ink-500">Your code</p>
        <div className="mt-1 flex items-center gap-3">
          <span className="text-3xl font-bold tracking-wider">{data.code.code}</span>
          <button onClick={() => copy(data.code.code)} className="rounded-lg border border-ink-300 px-3 py-1.5 text-sm hover:bg-ink-50">Copy</button>
          <button onClick={() => copy(shareUrl(data.code.code))} className="rounded-lg border border-ink-300 px-3 py-1.5 text-sm hover:bg-ink-50">Copy share link</button>
        </div>
        <p className="mt-2 text-sm text-ink-600">
          {data.code.redemptions} redemption{data.code.redemptions === 1 ? "" : "s"} so far.
        </p>
      </section>

      {data.redemptions.length > 0 && (
        <section>
          <h2 className="text-xl font-semibold">Redemptions</h2>
          <ul className="mt-2 space-y-2">
            {data.redemptions.map((r) => (
              <li key={r.id} className="flex items-center justify-between rounded-lg bg-white p-3 text-sm ring-1 ring-ink-200">
                <span>{new Date(r.redeemedAt).toLocaleString("en-KE")}</span>
                <span className={r.rewardPaidAt ? "text-green-700" : "text-ink-500"}>
                  {r.rewardPaidAt ? "Reward credited" : "Pending first paid invoice"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
