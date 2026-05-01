"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { api, getToken } from "@/lib/api";

export default function BookViewingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: listingId } = use(params);
  const router = useRouter();
  const [scheduledAt, setScheduledAt] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (typeof window !== "undefined" && !getToken()) {
    router.push(`/login?next=/listing/${listingId}/book`);
    return null;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/v1/viewings", {
        method: "POST",
        body: { listingId, scheduledAt: new Date(scheduledAt).toISOString(), notes: notes || undefined },
      });
      router.push("/me/viewings");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  // Min: 1 hour from now (in EAT for the picker).
  const min = new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 16);

  return (
    <form onSubmit={submit} className="mx-auto max-w-md space-y-4 rounded-xl bg-white p-8 ring-1 ring-ink-200">
      <h1 className="text-2xl font-bold">Book a viewing</h1>
      <p className="text-sm text-ink-600">The agent will confirm your slot. You&apos;ll get an SMS reminder the day before.</p>

      <label className="block">
        <span className="text-sm text-ink-600">When?</span>
        <input
          type="datetime-local"
          value={scheduledAt}
          min={min}
          onChange={(e) => setScheduledAt(e.target.value)}
          required
          className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2"
        />
      </label>

      <label className="block">
        <span className="text-sm text-ink-600">Notes for the agent (optional)</span>
        <textarea
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2"
        />
      </label>

      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <button disabled={busy || !scheduledAt} className="w-full rounded-lg bg-brand-500 py-3 font-semibold text-white hover:bg-brand-600 disabled:opacity-50">
        {busy ? "Booking…" : "Request viewing"}
      </button>
    </form>
  );
}
