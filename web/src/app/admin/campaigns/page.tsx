"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, getToken } from "@/lib/api";
import { toast } from "@/components/Toast";

interface Campaign {
  id: string;
  name: string;
  description?: string | null;
  templatePromptKey: string;
  targetTypes: string[];
  targetCities: string[];
  targetStages: string[];
  dailyCap: number;
  isActive: boolean;
  startedAt?: string | null;
}

const TEMPLATES = [
  { key: "bank_auction_v1", label: "Bank — auction/foreclosure desks" },
  { key: "auctioneer_v1", label: "Auctioneer — licensed firms" },
  { key: "agent_warm_v1", label: "Agent — warm pitch" },
  { key: "developer_v1", label: "Developer — bulk listings" },
  { key: "landlord_direct_v1", label: "Landlord — direct, no agency" },
];

export default function AdminCampaignsPage() {
  const router = useRouter();
  const [items, setItems] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    name: "",
    description: "",
    templatePromptKey: "agent_warm_v1",
    targetTypes: ["AGENT_AGENCY"] as string[],
    targetCities: ["Nairobi"] as string[],
    dailyCap: 50,
  });

  useEffect(() => {
    if (!getToken()) { router.push("/login"); return; }
    fetchCampaigns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchCampaigns() {
    setLoading(true);
    try {
      // No list endpoint yet — derive from a couple admin queries; fallback to direct DB later.
      // For now we just list the empty pattern. Wire up when needed.
      // TODO: GET /v1/admin/campaigns
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy("create");
    try {
      const c = await api<Campaign>("/v1/admin/campaigns", {
        method: "POST",
        body: {
          name: form.name,
          description: form.description || undefined,
          templatePromptKey: form.templatePromptKey,
          targetTypes: form.targetTypes,
          targetCities: form.targetCities,
          targetStages: ["QUALIFIED"],
          dailyCap: form.dailyCap,
        },
      });
      toast.success(`Campaign "${c.name}" created (paused). Activate it to start sending.`);
      setItems([c, ...items]);
      setShowCreate(false);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  async function toggleActive(c: Campaign) {
    setBusy(c.id);
    try {
      const updated = await api<Campaign>(`/v1/admin/campaigns/${c.id}/active`, {
        method: "POST",
        body: { active: !c.isActive },
      });
      setItems((prev) => prev.map((p) => p.id === c.id ? updated : p));
      toast.success(updated.isActive ? "Campaign activated" : "Campaign paused");
    } finally {
      setBusy(null);
    }
  }

  async function enroll(c: Campaign) {
    setBusy(c.id);
    try {
      const r = await api<{ queued: number }>(`/v1/admin/campaigns/${c.id}/enroll`, { method: "POST" });
      toast.success(`Queued ${r.queued} leads for outreach`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Link href="/admin" className="text-sm text-ink-500 hover:underline">← Admin</Link>
        <button onClick={() => setShowCreate((v) => !v)} className="rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-600">
          {showCreate ? "Close" : "+ New campaign"}
        </button>
      </div>
      <h1 className="text-3xl font-bold">Outreach campaigns</h1>
      <p className="text-ink-600">Sonnet-drafted personalized emails to qualified leads. Compliant with Kenya DPA: every email includes one-click unsubscribe.</p>

      {showCreate && (
        <form onSubmit={create} className="grid gap-3 rounded-xl bg-white p-4 ring-1 ring-ink-200">
          <input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required minLength={3} className="rounded-lg border border-ink-200 px-3 py-2" />
          <textarea placeholder="Description (optional)" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} className="rounded-lg border border-ink-200 px-3 py-2" />
          <label className="block">
            <span className="text-sm text-ink-600">Email template</span>
            <select value={form.templatePromptKey} onChange={(e) => setForm({ ...form, templatePromptKey: e.target.value })} className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2">
              {TEMPLATES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-sm text-ink-600">Daily cap</span>
            <input type="number" min={1} max={2000} value={form.dailyCap} onChange={(e) => setForm({ ...form, dailyCap: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2" />
          </label>
          <button disabled={busy === "create" || !form.name} className="rounded-lg bg-brand-500 px-3 py-2 font-medium text-white hover:bg-brand-600 disabled:opacity-50">
            {busy === "create" ? "Creating…" : "Create campaign (paused)"}
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-ink-500">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-ink-500">No campaigns yet. Create one above.</p>
      ) : (
        <ul className="space-y-3">
          {items.map((c) => (
            <li key={c.id} className="rounded-xl border border-ink-200 bg-white p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-semibold">{c.name}</p>
                  <p className="text-sm text-ink-500">{c.templatePromptKey} · daily cap {c.dailyCap}</p>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${c.isActive ? "bg-green-100 text-green-800" : "bg-ink-100 text-ink-700"}`}>
                  {c.isActive ? "Active" : "Paused"}
                </span>
              </div>
              <div className="mt-3 flex gap-2">
                <button disabled={busy === c.id} onClick={() => toggleActive(c)} className="rounded-lg border border-ink-300 px-3 py-1 text-sm hover:bg-ink-50 disabled:opacity-50">
                  {c.isActive ? "Pause" : "Activate"}
                </button>
                <button disabled={busy === c.id || !c.isActive} onClick={() => enroll(c)} className="rounded-lg bg-brand-500 px-3 py-1 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50">
                  Enroll qualified leads
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
