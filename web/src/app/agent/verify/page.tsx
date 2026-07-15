"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, getToken } from "@/lib/api";
import { btnBrand } from "@/components/ui";

export default function AgentVerifyPage() {
  const router = useRouter();
  const [form, setForm] = useState({ fullName: "", nationalId: "", kraPin: "", agencyName: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (typeof window !== "undefined" && !getToken()) {
    router.push("/login");
    return null;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/v1/verification/agent", { method: "POST", body: form });
      router.push("/agent");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Verification failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-md space-y-4 rounded-2xl border border-ink-200 bg-surface p-8 shadow-card">
      <div>
        <p className="font-sans text-xs font-semibold uppercase tracking-[0.16em] text-brand-700">Agent workspace</p>
        <h1 className="mt-1.5 font-serif text-2xl text-ink-900">Verify your agent account</h1>
      </div>
      <p className="text-sm text-ink-600">We&apos;ll match your KRA PIN against the registry. Your ID number is hashed; we never store the raw value.</p>

      <Field label="Full name (as on your ID)">
        <input
          value={form.fullName}
          onChange={(e) => setForm({ ...form, fullName: e.target.value })}
          required minLength={3}
          className="w-full rounded-xl border border-ink-200 bg-surface px-3 py-2"
        />
      </Field>
      <Field label="National ID number">
        <input
          inputMode="numeric"
          value={form.nationalId}
          onChange={(e) => setForm({ ...form, nationalId: e.target.value.replace(/\D/g, "") })}
          required pattern="\d{6,10}"
          className="w-full rounded-xl border border-ink-200 bg-surface px-3 py-2"
        />
      </Field>
      <Field label="KRA PIN">
        <input
          value={form.kraPin}
          onChange={(e) => setForm({ ...form, kraPin: e.target.value.toUpperCase() })}
          required pattern="[AP]\d{9}[A-Z]"
          placeholder="A123456789Z"
          className="w-full rounded-xl border border-ink-200 bg-surface px-3 py-2 uppercase"
        />
      </Field>
      <Field label="Agency name">
        <input
          value={form.agencyName}
          onChange={(e) => setForm({ ...form, agencyName: e.target.value })}
          required minLength={2}
          className="w-full rounded-xl border border-ink-200 bg-surface px-3 py-2"
        />
      </Field>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      <button disabled={busy} className={`w-full justify-center py-3 ${btnBrand} disabled:opacity-50`}>
        {busy ? "Submitting..." : "Submit for review"}
      </button>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm text-ink-600">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
