"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, getToken } from "@/lib/api";
import { toast } from "@/components/Toast";

interface PendingUser {
  id: string;
  name: string | null;
  phoneE164: string;
  role: string;
  kraPin?: string | null;
  createdAt: string;
  updatedAt: string;
}

export default function AdminVerificationPage() {
  const router = useRouter();
  const [items, setItems] = useState<PendingUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getToken()) {
      router.push("/login");
      return;
    }
    fetchItems();
  }, [router]);

  async function fetchItems() {
    setLoading(true);
    setError(null);
    try {
      const r = await api<{ items: PendingUser[] }>("/v1/admin/users/pending-verification");
      setItems(r.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load verification queue");
    } finally {
      setLoading(false);
    }
  }

  async function review(user: PendingUser, decision: "VERIFIED" | "REJECTED") {
    setBusy(user.id);
    try {
      await api(`/v1/verification/${user.id}/review`, { method: "POST", body: { decision } });
      setItems((prev) => prev.filter((item) => item.id !== user.id));
      toast.success(decision === "VERIFIED" ? "User verified" : "User rejected");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Review failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <Link href="/admin" className="text-sm text-ink-500 hover:underline">&lt;- Admin</Link>
      <div>
        <h1 className="text-3xl font-bold">Verification queue</h1>
        <p className="text-ink-600">Approve tenant, agent, and landlord identity submissions.</p>
      </div>

      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {loading ? (
        <p className="text-ink-500">Loading...</p>
      ) : items.length === 0 ? (
        <p className="text-ink-500">No pending verifications.</p>
      ) : (
        <ul className="space-y-3">
          {items.map((user) => (
            <li key={user.id} className="rounded-xl border border-ink-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{user.name ?? "Unnamed user"}</p>
                  <p className="text-sm text-ink-500">{user.role} / {user.phoneE164}</p>
                  {user.kraPin && <p className="mt-1 text-sm text-ink-700">KRA PIN: {user.kraPin}</p>}
                </div>
                <div className="flex gap-2">
                  <button disabled={busy === user.id} onClick={() => review(user, "VERIFIED")} className="rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50">Approve</button>
                  <button disabled={busy === user.id} onClick={() => review(user, "REJECTED")} className="rounded-lg border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50">Reject</button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
