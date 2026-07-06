"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, getToken } from "@/lib/api";
import { toast } from "@/components/Toast";

interface AiOutput {
  id: string;
  task: string;
  tier: string;
  model: string;
  confidence?: number | null;
  inputPreview?: string | null;
  output: unknown;
  createdAt: string;
}

interface AiMetrics {
  total: number;
  byGrade: Record<string, number>;
  correctRate: number | null;
  editRate: number | null;
}

export default function AdminAiQueuePage() {
  const router = useRouter();
  const [items, setItems] = useState<AiOutput[]>([]);
  const [metrics, setMetrics] = useState<AiMetrics | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getToken()) {
      router.push("/login");
      return;
    }
    void fetchQueue();
  }, [router]);

  async function fetchQueue() {
    setError(null);
    try {
      const [queue, m] = await Promise.all([
        api<{ items: AiOutput[] }>("/v1/admin/ai/queue?strategy=low_confidence"),
        api<AiMetrics>("/v1/admin/ai/metrics?sinceDays=7"),
      ]);
      setItems(queue.items);
      setMetrics(m);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load AI queue");
    }
  }

  async function grade(item: AiOutput, value: "correct" | "wrong" | "partial") {
    setBusy(item.id);
    try {
      await api(`/v1/admin/ai/${item.id}/feedback`, {
        method: "POST",
        body: { grade: value, promoteToEval: value !== "correct" },
      });
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      toast.success("Feedback saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save feedback");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <Link href="/admin" className="text-sm text-ink-500 hover:underline">&lt;- Admin</Link>
      <div>
        <h1 className="text-3xl font-bold">AI feedback queue</h1>
        <p className="text-ink-600">Review low-confidence AI outputs and promote failures into eval mining.</p>
      </div>

      {metrics && (
        <section className="grid gap-3 sm:grid-cols-3">
          <Stat label="7d graded" value={metrics.total} />
          <Stat label="Correct rate" value={formatPct(metrics.correctRate)} />
          <Stat label="Edit rate" value={formatPct(metrics.editRate)} />
        </section>
      )}

      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {items.length === 0 ? (
        <p className="text-ink-500">No ungraded AI outputs.</p>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <li key={item.id} className="rounded-xl border border-ink-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-semibold">{item.task}</p>
                  <p className="text-sm text-ink-500">
                    {item.tier} / {item.model} / confidence {item.confidence ?? "n/a"}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button disabled={busy === item.id} onClick={() => grade(item, "correct")} className="rounded-lg border border-ink-300 px-3 py-1 text-sm hover:bg-ink-50 disabled:opacity-50">Correct</button>
                  <button disabled={busy === item.id} onClick={() => grade(item, "partial")} className="rounded-lg border border-ink-300 px-3 py-1 text-sm hover:bg-ink-50 disabled:opacity-50">Partial</button>
                  <button disabled={busy === item.id} onClick={() => grade(item, "wrong")} className="rounded-lg bg-red-600 px-3 py-1 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">Wrong</button>
                </div>
              </div>
              {item.inputPreview && <p className="mt-3 text-sm text-ink-700">{item.inputPreview}</p>}
              <pre className="mt-3 max-h-64 overflow-auto rounded-lg bg-ink-950 p-3 text-xs text-white">
                {JSON.stringify(item.output, null, 2)}
              </pre>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl bg-white p-4 ring-1 ring-ink-200">
      <p className="text-xs uppercase tracking-wide text-ink-500">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  );
}

function formatPct(v: number | null): string {
  return v === null ? "n/a" : `${Math.round(v * 100)}%`;
}
