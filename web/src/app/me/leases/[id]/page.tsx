"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, getToken } from "@/lib/api";
import { formatKes } from "@/lib/format";

interface Lease {
  id: string;
  status: "PENDING_DEPOSIT" | "ACTIVE" | "ENDED" | "TERMINATED" | "DISPUTED";
  rentKesCents: number;
  depositKesCents: number;
  signedTenantAt?: string | null;
  signedLandlordAt?: string | null;
  startDate: string;
  listing: { id: string; title: string };
  tenant: { id: string; name: string | null; phoneE164: string };
  landlord: { id: string; name: string | null };
  escrow?: { id: string; status: string; amountKesCents: number } | null;
}

export default function LeaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [lease, setLease] = useState<Lease | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stkResult, setStkResult] = useState<string | null>(null);

  useEffect(() => {
    if (!getToken()) {
      router.push("/login");
      return;
    }
    api<Lease>(`/v1/leases/${id}`).then(setLease).catch((e) => setError(e.message));
  }, [id, router]);

  async function sign() {
    setBusy(true);
    setError(null);
    try {
      const updated = await api<Lease>(`/v1/leases/${id}/sign`, { method: "POST" });
      setLease(updated);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function payDeposit() {
    setBusy(true);
    setError(null);
    setStkResult(null);
    try {
      const r = await api<{ escrowId: string; customerMessage: string }>("/v1/escrow/initiate", {
        method: "POST",
        body: { leaseId: id },
      });
      setStkResult(r.customerMessage);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not initiate STK push");
    } finally {
      setBusy(false);
    }
  }

  async function confirmMoveIn() {
    if (!lease?.escrow) return;
    setBusy(true);
    try {
      await api(`/v1/escrow/${lease.escrow.id}/confirm`, { method: "POST" });
      const updated = await api<Lease>(`/v1/leases/${id}`);
      setLease(updated);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  if (error) return <div className="rounded-lg bg-red-50 p-4 text-red-700">{error}</div>;
  if (!lease) return <div className="text-ink-500">Loading…</div>;

  return (
    <div className="space-y-6">
      <Link href="/me/leases" className="text-sm text-ink-500 hover:underline">← All leases</Link>

      <header>
        <h1 className="text-3xl font-bold">{lease.listing.title}</h1>
        <p className="text-ink-600">Lease — {lease.status.replace("_", " ").toLowerCase()}</p>
      </header>

      <section className="grid gap-4 rounded-xl bg-white p-6 ring-1 ring-ink-200 sm:grid-cols-2">
        <div>
          <p className="text-sm text-ink-500">Rent</p>
          <p className="font-semibold">{formatKes(lease.rentKesCents)}/mo</p>
        </div>
        <div>
          <p className="text-sm text-ink-500">Deposit</p>
          <p className="font-semibold">{formatKes(lease.depositKesCents)}</p>
        </div>
        <div>
          <p className="text-sm text-ink-500">Tenant</p>
          <p>{lease.tenant.name ?? lease.tenant.phoneE164} {lease.signedTenantAt && "✓ signed"}</p>
        </div>
        <div>
          <p className="text-sm text-ink-500">Landlord</p>
          <p>{lease.landlord.name ?? "—"} {lease.signedLandlordAt && "✓ signed"}</p>
        </div>
      </section>

      <section className="space-y-3 rounded-xl bg-white p-6 ring-1 ring-ink-200">
        <h2 className="font-semibold">Next steps</h2>
        {!lease.signedTenantAt && (
          <button onClick={sign} disabled={busy}
            className="rounded-lg bg-brand-500 px-4 py-2 font-medium text-white hover:bg-brand-600 disabled:opacity-50">
            Sign lease
          </button>
        )}
        {lease.signedTenantAt && lease.status === "PENDING_DEPOSIT" && !lease.escrow && (
          <button onClick={payDeposit} disabled={busy}
            className="rounded-lg bg-brand-500 px-4 py-2 font-medium text-white hover:bg-brand-600 disabled:opacity-50">
            Pay deposit (M-Pesa)
          </button>
        )}
        {lease.escrow && lease.escrow.status === "PENDING" && (
          <p className="text-sm text-ink-600">Waiting for M-Pesa confirmation. Check your phone for the prompt.</p>
        )}
        {lease.escrow && lease.escrow.status === "HELD" && lease.status === "ACTIVE" && (
          <button onClick={confirmMoveIn} disabled={busy}
            className="rounded-lg bg-brand-500 px-4 py-2 font-medium text-white hover:bg-brand-600 disabled:opacity-50">
            Confirm move-in (release deposit to landlord)
          </button>
        )}
        {lease.escrow && lease.escrow.status === "RELEASED" && (
          <p className="text-sm text-green-700">Deposit released to landlord. Lease is fully settled.</p>
        )}
        {stkResult && <p className="text-sm text-ink-700">{stkResult}</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </section>
    </div>
  );
}
