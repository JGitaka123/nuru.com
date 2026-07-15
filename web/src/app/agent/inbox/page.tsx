"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, getToken } from "@/lib/api";
import { photoUrl } from "@/lib/format";
import { PageHeading } from "@/components/ui";

interface InquiryRow {
  id: string;
  message?: string | null;
  channel: string;
  createdAt: string;
  respondedAt?: string | null;
  listing: { id: string; title: string; primaryPhotoKey?: string | null };
  tenant: { id: string; name: string | null; phoneE164: string };
}

export default function AgentInboxPage() {
  const router = useRouter();
  const [items, setItems] = useState<InquiryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getToken()) {
      router.push("/login");
      return;
    }
    api<{ items: InquiryRow[] }>("/v1/inquiries/me")
      .then((r) => setItems(r.items))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [router]);

  async function markResponded(id: string) {
    await api(`/v1/inquiries/${id}/responded`, { method: "POST" }).catch(() => undefined);
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, respondedAt: new Date().toISOString() } : i)));
  }

  if (loading) return <div className="text-ink-500">Loading…</div>;
  if (error) return <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>;

  return (
    <div className="space-y-8">
      <PageHeading
        eyebrow="Agent workspace"
        title="Inbox"
        subtitle="Tenants who messaged you about your listings."
      />

      {items.length === 0 ? (
        <p className="text-ink-500">No inquiries yet.</p>
      ) : (
        <ul className="space-y-3">
          {items.map((i) => (
            <li key={i.id} className={`flex gap-4 rounded-2xl border bg-surface p-4 shadow-card ${i.respondedAt ? "border-ink-200" : "border-brand-300 bg-brand-50/40"}`}>
              <div className="h-16 w-16 flex-none overflow-hidden rounded-xl bg-ink-100">
                {i.listing.primaryPhotoKey && photoUrl(i.listing.primaryPhotoKey) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photoUrl(i.listing.primaryPhotoKey)!} alt="" className="h-full w-full object-cover" />
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <Link href={`/agent/${i.listing.id}`} className="truncate font-serif text-lg text-ink-900 hover:text-brand-600">
                  {i.listing.title}
                </Link>
                <p className="text-sm">
                  <strong>{i.tenant.name ?? "Anonymous"}</strong> ({i.tenant.phoneE164})
                  <span className="text-ink-500"> via {i.channel} · {new Date(i.createdAt).toLocaleString("en-KE", { timeZone: "Africa/Nairobi" })}</span>
                </p>
                {i.message && <p className="mt-1 whitespace-pre-line text-sm text-ink-700">{i.message}</p>}
                {!i.respondedAt && (
                  <button onClick={() => markResponded(i.id)} className="mt-2 text-xs text-brand-600 hover:underline">
                    Mark as responded
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
