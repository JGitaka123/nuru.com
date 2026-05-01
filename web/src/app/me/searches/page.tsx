"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, getToken } from "@/lib/api";
import { toast } from "@/components/Toast";
import { enablePush, pushSupported } from "@/lib/push";

interface SavedSearch {
  id: string;
  name: string;
  query?: string | null;
  neighborhoods: string[];
  bedroomsMin: number | null;
  bedroomsMax: number | null;
  rentMaxKesCents: number | null;
  mustHave: string[];
  alertPush: boolean;
  alertSms: boolean;
  alertEmail: boolean;
  isActive: boolean;
  lastMatchAt: string | null;
}

const NEIGHBORHOODS = ["Kilimani", "Westlands", "Kileleshwa", "Lavington", "Parklands", "Karen", "Lang'ata", "Hurlingham"];

export default function SavedSearchesPage() {
  const router = useRouter();
  const [items, setItems] = useState<SavedSearch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // form state
  const [form, setForm] = useState({
    name: "",
    neighborhoods: [] as string[],
    bedroomsMin: 0,
    rentMaxKes: 0,
    alertPush: true,
    alertSms: false,
    alertEmail: false,
  });

  useEffect(() => {
    if (!getToken()) { router.push("/login"); return; }
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refresh() {
    setLoading(true);
    try {
      const r = await api<{ items: SavedSearch[] }>("/v1/saved-searches");
      setItems(r.items);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name) return;
    setCreating(true);
    try {
      await api("/v1/saved-searches", {
        method: "POST",
        body: {
          name: form.name,
          neighborhoods: form.neighborhoods,
          bedroomsMin: form.bedroomsMin > 0 ? form.bedroomsMin : undefined,
          rentMaxKesCents: form.rentMaxKes > 0 ? form.rentMaxKes * 100 : undefined,
          alertPush: form.alertPush,
          alertSms: form.alertSms,
          alertEmail: form.alertEmail,
        },
      });
      toast.success("Alert created");
      if (form.alertPush && pushSupported()) {
        enablePush().catch(() => undefined);
      }
      setForm({ name: "", neighborhoods: [], bedroomsMin: 0, rentMaxKes: 0, alertPush: true, alertSms: false, alertEmail: false });
      await refresh();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not create");
    } finally {
      setCreating(false);
    }
  }

  async function toggleActive(id: string, isActive: boolean) {
    await api(`/v1/saved-searches/${id}/active`, { method: "POST", body: { isActive } });
    setItems((prev) => prev.map((s) => s.id === id ? { ...s, isActive } : s));
  }

  async function remove(id: string) {
    await api(`/v1/saved-searches/${id}`, { method: "DELETE" });
    setItems((prev) => prev.filter((s) => s.id !== id));
    toast.info("Alert removed");
  }

  if (loading) return <div className="text-ink-500">Loading…</div>;
  if (error) return <div className="rounded-lg bg-red-50 p-4 text-red-700">{error}</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Search alerts</h1>
        <p className="mt-1 text-ink-600">Get notified the moment a listing matches your criteria.</p>
      </div>

      <form onSubmit={create} className="grid gap-3 rounded-xl bg-white p-6 ring-1 ring-ink-200 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className="text-sm text-ink-600">Alert name</span>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="e.g. 2BR Kilimani under 60K"
            required maxLength={100}
            className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2"
          />
        </label>
        <div className="sm:col-span-2">
          <span className="text-sm text-ink-600">Neighborhoods</span>
          <div className="mt-1 flex flex-wrap gap-2">
            {NEIGHBORHOODS.map((n) => {
              const selected = form.neighborhoods.includes(n);
              return (
                <button type="button" key={n}
                  onClick={() => setForm({
                    ...form,
                    neighborhoods: selected ? form.neighborhoods.filter((x) => x !== n) : [...form.neighborhoods, n],
                  })}
                  className={`rounded-full border px-3 py-1 text-sm ${selected ? "border-brand-400 bg-brand-50 text-brand-800" : "border-ink-200"}`}>
                  {n}
                </button>
              );
            })}
          </div>
        </div>
        <label className="block">
          <span className="text-sm text-ink-600">Min bedrooms</span>
          <input type="number" min={0} max={10} value={form.bedroomsMin}
            onChange={(e) => setForm({ ...form, bedroomsMin: Number(e.target.value) })}
            className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2" />
        </label>
        <label className="block">
          <span className="text-sm text-ink-600">Max rent (KES)</span>
          <input type="number" min={0} step={1000} value={form.rentMaxKes}
            onChange={(e) => setForm({ ...form, rentMaxKes: Number(e.target.value) })}
            className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2" />
        </label>
        <fieldset className="sm:col-span-2">
          <legend className="text-sm text-ink-600">Notify me via</legend>
          <div className="mt-2 flex flex-wrap gap-3 text-sm">
            <Toggle label="Push" checked={form.alertPush} onChange={(v) => setForm({ ...form, alertPush: v })} />
            <Toggle label="SMS" checked={form.alertSms} onChange={(v) => setForm({ ...form, alertSms: v })} />
            <Toggle label="Email" checked={form.alertEmail} onChange={(v) => setForm({ ...form, alertEmail: v })} />
          </div>
        </fieldset>
        <button disabled={creating || !form.name} className="rounded-lg bg-brand-500 px-4 py-2 font-semibold text-white hover:bg-brand-600 disabled:opacity-50 sm:col-span-2">
          {creating ? "Saving…" : "Create alert"}
        </button>
      </form>

      {items.length === 0 ? (
        <p className="text-ink-500">No alerts yet.</p>
      ) : (
        <ul className="space-y-3">
          {items.map((s) => (
            <li key={s.id} className="flex items-start justify-between gap-4 rounded-xl border border-ink-200 bg-white p-4">
              <div>
                <p className="font-semibold">{s.name}</p>
                <p className="text-sm text-ink-500">
                  {s.neighborhoods.join(", ") || "Any area"}
                  {s.bedroomsMin ? ` · ${s.bedroomsMin}+ BR` : ""}
                  {s.rentMaxKesCents ? ` · ≤ KES ${(s.rentMaxKesCents / 100).toLocaleString("en-KE")}` : ""}
                </p>
                <p className="mt-1 text-xs text-ink-500">
                  Alerts: {[s.alertPush && "push", s.alertSms && "sms", s.alertEmail && "email"].filter(Boolean).join(", ") || "(none)"}
                  {s.lastMatchAt && ` · last match ${new Date(s.lastMatchAt).toLocaleDateString("en-KE")}`}
                </p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <button onClick={() => toggleActive(s.id, !s.isActive)} className="text-xs text-ink-600 hover:underline">
                  {s.isActive ? "Pause" : "Resume"}
                </button>
                <button onClick={() => remove(s.id)} className="text-xs text-red-600 hover:underline">
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className={`cursor-pointer rounded-full border px-3 py-1 ${checked ? "border-brand-400 bg-brand-50 text-brand-800" : "border-ink-200 text-ink-700"}`}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="sr-only" />
      {label}
    </label>
  );
}
