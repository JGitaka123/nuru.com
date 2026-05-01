"use client";

import { useEffect, useState } from "react";
import { api, getToken } from "@/lib/api";
import { toast } from "@/components/Toast";

interface Review {
  id: string;
  rating: number;
  body?: string | null;
  verified: boolean;
  createdAt: string;
  authorId: string;
}

export default function ReviewsBlock({ listingId }: { listingId: string }) {
  const [items, setItems] = useState<Review[]>([]);
  const [summary, setSummary] = useState<{ avg: number | null; count: number }>({ avg: null, count: 0 });
  const [showForm, setShowForm] = useState(false);
  const [rating, setRating] = useState(5);
  const [body, setBody] = useState("");
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    api<{ items: Review[]; summary: { avg: number | null; count: number } }>(`/v1/listings/${listingId}/reviews`, { auth: false })
      .then((r) => { setItems(r.items); setSummary(r.summary); })
      .catch(() => undefined);
  }, [listingId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!getToken()) {
      window.location.href = `/login?next=/listing/${listingId}`;
      return;
    }
    setPosting(true);
    try {
      const r = await api<Review>("/v1/reviews", {
        method: "POST",
        body: { kind: "LISTING", targetListingId: listingId, rating, body: body || undefined },
      });
      setItems((prev) => [r, ...prev.filter((p) => p.id !== r.id)]);
      setShowForm(false);
      setBody("");
      toast.success("Review posted");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setPosting(false);
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">
          Reviews{summary.count > 0 && (
            <span className="ml-2 text-base font-normal text-ink-500">
              {summary.avg ? summary.avg.toFixed(1) : "—"} ★ ({summary.count})
            </span>
          )}
        </h2>
        <button onClick={() => setShowForm((v) => !v)} className="text-sm text-brand-600 hover:underline">
          {showForm ? "Close" : "Write a review"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={submit} className="rounded-xl bg-white p-4 ring-1 ring-ink-200">
          <div className="flex gap-1" role="radiogroup" aria-label="Rating">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={rating === n}
                onClick={() => setRating(n)}
                className={`text-3xl ${n <= rating ? "text-amber-500" : "text-ink-300"} hover:text-amber-400`}
              >
                ★
              </button>
            ))}
          </div>
          <textarea
            value={body} onChange={(e) => setBody(e.target.value)}
            placeholder="What was your experience?"
            rows={3}
            className="mt-2 w-full rounded-lg border border-ink-200 px-3 py-2 text-sm"
          />
          <button disabled={posting} className="mt-2 rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50">
            {posting ? "Posting…" : "Post review"}
          </button>
        </form>
      )}

      {items.length === 0 ? (
        <p className="text-ink-500 text-sm">No reviews yet — be the first.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((r) => (
            <li key={r.id} className="rounded-xl bg-white p-4 ring-1 ring-ink-200">
              <div className="flex items-center gap-2">
                <span className="text-amber-500">{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</span>
                {r.verified && <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-800">Verified</span>}
                <span className="ml-auto text-xs text-ink-500">{new Date(r.createdAt).toLocaleDateString("en-KE")}</span>
              </div>
              {r.body && <p className="mt-1 whitespace-pre-line text-sm text-ink-700">{r.body}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
