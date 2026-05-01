"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, getToken } from "@/lib/api";
import { toast } from "@/components/Toast";

interface Lead {
  id: string;
  type: string;
  stage: string;
  organizationName: string;
  contactName?: string | null;
  email?: string | null;
  city?: string | null;
  estimatedListingsCount?: number | null;
  source: string;
  createdAt: string;
}

const TYPES = ["AUCTIONEER", "BANK", "AGENT_AGENCY", "LANDLORD", "DEVELOPER", "COURT", "OTHER"] as const;
const STAGES = ["NEW", "ENRICHED", "QUALIFIED", "CONTACTED", "ENGAGED", "ONBOARDED", "REJECTED", "UNSUBSCRIBED", "BOUNCED"] as const;

const STAGE_BADGE: Record<string, string> = {
  NEW: "bg-ink-100 text-ink-800",
  ENRICHED: "bg-blue-100 text-blue-800",
  QUALIFIED: "bg-amber-100 text-amber-800",
  CONTACTED: "bg-purple-100 text-purple-800",
  ENGAGED: "bg-green-100 text-green-800",
  ONBOARDED: "bg-emerald-100 text-emerald-800",
  REJECTED: "bg-red-100 text-red-800",
  UNSUBSCRIBED: "bg-ink-200 text-ink-800",
  BOUNCED: "bg-orange-100 text-orange-800",
};

export default function AdminLeadsPage() {
  const router = useRouter();
  const [items, setItems] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string>("");
  const [filterStage, setFilterStage] = useState<string>("");
  const [showCreate, setShowCreate] = useState(false);

  // create form
  const [form, setForm] = useState({
    type: "AUCTIONEER",
    organizationName: "",
    contactName: "",
    email: "",
    websiteUrl: "",
    city: "Nairobi",
    estimatedListingsCount: 0,
    signalNotes: "",
    source: "manual",
  });

  useEffect(() => {
    if (!getToken()) { router.push("/login"); return; }
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterType, filterStage]);

  async function refresh() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterType) params.set("type", filterType);
      if (filterStage) params.set("stage", filterStage);
      params.set("limit", "100");
      const r = await api<{ items: Lead[] }>(`/v1/admin/leads?${params}`);
      setItems(r.items);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api("/v1/admin/leads", { method: "POST", body: {
        ...form,
        contactName: form.contactName || undefined,
        email: form.email || undefined,
        websiteUrl: form.websiteUrl || undefined,
        signalNotes: form.signalNotes || undefined,
        estimatedListingsCount: form.estimatedListingsCount > 0 ? form.estimatedListingsCount : undefined,
      } });
      toast.success("Lead created");
      setShowCreate(false);
      setForm({ ...form, organizationName: "", contactName: "", email: "", websiteUrl: "", signalNotes: "" });
      await refresh();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }

  async function setStage(id: string, stage: string) {
    await api(`/v1/admin/leads/${id}/stage`, { method: "POST", body: { stage } });
    setItems((prev) => prev.map((l) => l.id === id ? { ...l, stage } : l));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Link href="/admin" className="text-sm text-ink-500 hover:underline">← Admin</Link>
        <button onClick={() => setShowCreate((v) => !v)} className="rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-600">
          {showCreate ? "Close" : "+ Add lead"}
        </button>
      </div>
      <h1 className="text-3xl font-bold">Leads</h1>

      {showCreate && (
        <form onSubmit={create} className="grid gap-3 rounded-xl bg-white p-4 ring-1 ring-ink-200 sm:grid-cols-2">
          <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="rounded-lg border border-ink-200 px-3 py-2">
            {TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
          <input placeholder="Organization name" value={form.organizationName} onChange={(e) => setForm({ ...form, organizationName: e.target.value })} required minLength={2} className="rounded-lg border border-ink-200 px-3 py-2" />
          <input placeholder="Contact name" value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} className="rounded-lg border border-ink-200 px-3 py-2" />
          <input placeholder="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="rounded-lg border border-ink-200 px-3 py-2" />
          <input placeholder="Website" type="url" value={form.websiteUrl} onChange={(e) => setForm({ ...form, websiteUrl: e.target.value })} className="rounded-lg border border-ink-200 px-3 py-2" />
          <input placeholder="City" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className="rounded-lg border border-ink-200 px-3 py-2" />
          <input placeholder="Est. listings count" type="number" min={0} value={form.estimatedListingsCount} onChange={(e) => setForm({ ...form, estimatedListingsCount: Number(e.target.value) })} className="rounded-lg border border-ink-200 px-3 py-2" />
          <input placeholder="Source" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} className="rounded-lg border border-ink-200 px-3 py-2" />
          <textarea placeholder="Signal notes (why this lead?)" value={form.signalNotes} onChange={(e) => setForm({ ...form, signalNotes: e.target.value })} className="rounded-lg border border-ink-200 px-3 py-2 sm:col-span-2" rows={2} />
          <button className="rounded-lg bg-brand-500 px-3 py-2 font-medium text-white hover:bg-brand-600 sm:col-span-2">Create lead</button>
        </form>
      )}

      <div className="flex gap-2 text-sm">
        <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="rounded-lg border border-ink-200 bg-white px-3 py-1.5">
          <option value="">All types</option>
          {TYPES.map((t) => <option key={t}>{t}</option>)}
        </select>
        <select value={filterStage} onChange={(e) => setFilterStage(e.target.value)} className="rounded-lg border border-ink-200 bg-white px-3 py-1.5">
          <option value="">All stages</option>
          {STAGES.map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>

      {loading ? (
        <p className="text-ink-500">Loading…</p>
      ) : error ? (
        <div className="rounded-lg bg-red-50 p-4 text-red-700">{error}</div>
      ) : items.length === 0 ? (
        <p className="text-ink-500">No leads yet.</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-ink-200">
          <table className="w-full bg-white text-sm">
            <thead className="bg-ink-50 text-left text-xs uppercase tracking-wide text-ink-500">
              <tr>
                <th className="px-3 py-2">Organization</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">City</th>
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2">Stage</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((l) => (
                <tr key={l.id} className="border-t border-ink-100">
                  <td className="px-3 py-2 font-medium">{l.organizationName}{l.contactName && <span className="block text-xs text-ink-500">{l.contactName}</span>}</td>
                  <td className="px-3 py-2">{l.type}</td>
                  <td className="px-3 py-2">{l.city ?? "—"}</td>
                  <td className="px-3 py-2 text-ink-700">{l.email ?? "—"}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STAGE_BADGE[l.stage] ?? "bg-ink-100"}`}>{l.stage}</span>
                  </td>
                  <td className="px-3 py-2">
                    <select value={l.stage} onChange={(e) => setStage(l.id, e.target.value)} className="rounded border border-ink-200 px-2 py-1 text-xs">
                      {STAGES.map((s) => <option key={s}>{s}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
