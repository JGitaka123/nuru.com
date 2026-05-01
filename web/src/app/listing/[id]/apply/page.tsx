"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { api, getToken } from "@/lib/api";

export default function ApplyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: listingId } = use(params);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [employerName, setEmployer] = useState("");
  const [income, setIncome] = useState<number>(0);
  const [refs, setRefs] = useState([
    { name: "", phone: "", relationship: "" },
  ]);

  if (typeof window !== "undefined" && !getToken()) {
    router.push(`/login?next=/listing/${listingId}/apply`);
    return null;
  }

  function updateRef(i: number, key: "name" | "phone" | "relationship", value: string) {
    setRefs((prev) => prev.map((r, j) => (j === i ? { ...r, [key]: value } : r)));
  }

  function addRef() {
    if (refs.length >= 3) return;
    setRefs([...refs, { name: "", phone: "", relationship: "" }]);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/v1/applications", {
        method: "POST",
        body: {
          listingId,
          employerName: employerName || undefined,
          monthlyIncomeKesCents: income > 0 ? income * 100 : undefined,
          references: refs.filter((r) => r.name && r.phone && r.relationship),
        },
      });
      router.push("/me/applications");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Submission failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-xl space-y-4 rounded-xl bg-white p-8 ring-1 ring-ink-200">
      <h1 className="text-2xl font-bold">Apply to rent</h1>
      <p className="text-sm text-ink-600">
        Your information is private. We use it to help the agent decide. National
        ID is hashed; we never share raw values.
      </p>

      <Field label="Employer (optional)">
        <input
          value={employerName} onChange={(e) => setEmployer(e.target.value)}
          className="w-full rounded-lg border border-ink-200 px-3 py-2"
        />
      </Field>
      <Field label="Monthly income (KES)">
        <input
          type="number" min={0} step={1000}
          value={income || ""}
          onChange={(e) => setIncome(Number(e.target.value))}
          className="w-full rounded-lg border border-ink-200 px-3 py-2"
        />
      </Field>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-ink-700">References (1-3)</legend>
        {refs.map((r, i) => (
          <div key={i} className="grid grid-cols-3 gap-2 text-sm">
            <input
              placeholder="Name"
              value={r.name} onChange={(e) => updateRef(i, "name", e.target.value)}
              className="rounded border border-ink-200 px-2 py-1.5"
            />
            <input
              placeholder="0712..."
              value={r.phone} onChange={(e) => updateRef(i, "phone", e.target.value)}
              className="rounded border border-ink-200 px-2 py-1.5"
            />
            <input
              placeholder="Manager"
              value={r.relationship} onChange={(e) => updateRef(i, "relationship", e.target.value)}
              className="rounded border border-ink-200 px-2 py-1.5"
            />
          </div>
        ))}
        {refs.length < 3 && (
          <button type="button" onClick={addRef} className="text-sm text-brand-600 hover:underline">
            + Add another
          </button>
        )}
      </fieldset>

      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <button disabled={busy} className="w-full rounded-lg bg-brand-500 py-3 font-semibold text-white hover:bg-brand-600 disabled:opacity-50">
        {busy ? "Submitting…" : "Submit application"}
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
