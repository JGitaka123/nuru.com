"use client";

import { useEffect, useState } from "react";
import { api, ApiError, getToken } from "@/lib/api";

export default function SaveButton({ listingId }: { listingId: string }) {
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!getToken()) return;
    // No /v1/saved/:id endpoint; check via list (cheap: cap 100 saves per user).
    api<{ items: Array<{ listing: { id: string } }> }>("/v1/saved")
      .then((r) => setSaved(r.items.some((i) => i.listing.id === listingId)))
      .catch(() => undefined);
  }, [listingId]);

  async function toggle() {
    if (!getToken()) {
      window.location.href = `/login?next=/listing/${listingId}`;
      return;
    }
    setBusy(true);
    try {
      if (saved) {
        await api(`/v1/saved/${listingId}`, { method: "DELETE" });
        setSaved(false);
      } else {
        await api("/v1/saved", { method: "POST", body: { listingId } });
        setSaved(true);
      }
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        window.location.href = `/login?next=/listing/${listingId}`;
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-pressed={saved}
      className={`flex items-center gap-1 rounded-lg border px-3 py-2 text-sm font-medium transition ${
        saved
          ? "border-red-300 bg-red-50 text-red-700"
          : "border-ink-300 text-ink-700 hover:border-red-300 hover:text-red-700"
      } disabled:opacity-50`}
    >
      <span aria-hidden="true">{saved ? "♥" : "♡"}</span>
      {saved ? "Saved" : "Save"}
    </button>
  );
}
