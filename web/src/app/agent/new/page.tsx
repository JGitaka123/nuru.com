"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, getToken } from "@/lib/api";

const NEIGHBORHOODS = ["Kilimani", "Westlands", "Kileleshwa", "Lavington", "Parklands"];
const CATEGORIES = [
  ["BEDSITTER", "Bedsitter"],
  ["STUDIO", "Studio"],
  ["ONE_BR", "1 bedroom"],
  ["TWO_BR", "2 bedroom"],
  ["THREE_BR", "3 bedroom"],
  ["FOUR_PLUS_BR", "4+ bedroom"],
  ["MAISONETTE", "Maisonette"],
  ["TOWNHOUSE", "Townhouse"],
] as const;

export default function NewListingPage() {
  const router = useRouter();
  const [photos, setPhotos] = useState<Array<{ key: string; url: string }>>([]);
  const [uploading, setUploading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    title: "",
    description: "",
    category: "TWO_BR",
    bedrooms: 2,
    bathrooms: 1,
    rentKes: 60000,
    depositMonths: 2,
    neighborhood: "Kilimani",
    estate: "",
    features: [] as string[],
  });

  if (typeof window !== "undefined" && !getToken()) {
    router.push("/login");
    return null;
  }

  async function handleUpload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const signed = await api<{ url: string; key: string }>(
        "/v1/photos/upload-url",
        { method: "POST", body: { contentType: file.type, contentLength: file.size, folder: "listings" } },
      );
      const put = await fetch(signed.url, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!put.ok) throw new Error(`Upload failed: ${put.status}`);
      setPhotos((prev) => [...prev, { key: signed.key, url: URL.createObjectURL(file) }]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (photos.length < 3) {
      setError("Please add at least 3 photos");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const listing = await api<{ id: string }>("/v1/listings", {
        method: "POST",
        body: {
          title: form.title,
          description: form.description,
          category: form.category,
          bedrooms: form.bedrooms,
          bathrooms: form.bathrooms,
          rentKesCents: form.rentKes * 100,
          depositMonths: form.depositMonths,
          features: form.features,
          neighborhood: form.neighborhood,
          estate: form.estate || undefined,
          photoKeys: photos.map((p) => p.key),
          primaryPhotoKey: photos[0].key,
        },
      });
      // Trigger AI enrichment.
      await api(`/v1/listings/${listing.id}/photos`, {
        method: "POST",
        body: { keys: photos.map((p) => p.key), enrich: true },
      });
      router.push(`/agent/${listing.id}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not create listing");
    } finally {
      setCreating(false);
    }
  }

  return (
    <form onSubmit={handleCreate} className="space-y-6">
      <h1 className="text-3xl font-bold">New listing</h1>

      <section className="rounded-xl bg-white p-6 ring-1 ring-ink-200">
        <h2 className="font-semibold">Photos</h2>
        <p className="text-sm text-ink-500">3-10 photos. We&apos;ll use AI to help draft the title and description.</p>
        <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-5">
          {photos.map((p) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={p.key} src={p.url} alt="" className="aspect-square rounded-lg object-cover ring-1 ring-ink-200" />
          ))}
          <label className="flex aspect-square cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-ink-300 text-ink-500 hover:bg-ink-50">
            <span className="text-3xl">+</span>
            <span className="text-xs">{uploading ? "Uploading…" : "Add photo"}</span>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])}
              disabled={uploading}
            />
          </label>
        </div>
      </section>

      <section className="grid gap-4 rounded-xl bg-white p-6 ring-1 ring-ink-200 sm:grid-cols-2">
        <Field label="Listing title">
          <input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            required minLength={5}
            className="w-full rounded-lg border border-ink-200 px-3 py-2"
            placeholder="e.g. 2BR with parking in Yaya area"
          />
        </Field>
        <Field label="Neighborhood">
          <select
            value={form.neighborhood}
            onChange={(e) => setForm({ ...form, neighborhood: e.target.value })}
            className="w-full rounded-lg border border-ink-200 px-3 py-2"
          >
            {NEIGHBORHOODS.map((n) => <option key={n}>{n}</option>)}
          </select>
        </Field>
        <Field label="Estate (optional)">
          <input
            value={form.estate}
            onChange={(e) => setForm({ ...form, estate: e.target.value })}
            className="w-full rounded-lg border border-ink-200 px-3 py-2"
          />
        </Field>
        <Field label="Type">
          <select
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
            className="w-full rounded-lg border border-ink-200 px-3 py-2"
          >
            {CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>
        <Field label="Bedrooms">
          <input
            type="number" min={0} max={10} value={form.bedrooms}
            onChange={(e) => setForm({ ...form, bedrooms: Number(e.target.value) })}
            className="w-full rounded-lg border border-ink-200 px-3 py-2"
          />
        </Field>
        <Field label="Bathrooms">
          <input
            type="number" min={1} max={10} value={form.bathrooms}
            onChange={(e) => setForm({ ...form, bathrooms: Number(e.target.value) })}
            className="w-full rounded-lg border border-ink-200 px-3 py-2"
          />
        </Field>
        <Field label="Monthly rent (KES)">
          <input
            type="number" min={5000} step={1000} value={form.rentKes}
            onChange={(e) => setForm({ ...form, rentKes: Number(e.target.value) })}
            className="w-full rounded-lg border border-ink-200 px-3 py-2"
          />
        </Field>
        <Field label="Deposit (months)">
          <input
            type="number" min={0} max={6} value={form.depositMonths}
            onChange={(e) => setForm({ ...form, depositMonths: Number(e.target.value) })}
            className="w-full rounded-lg border border-ink-200 px-3 py-2"
          />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Description">
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              required minLength={40} rows={5}
              className="w-full rounded-lg border border-ink-200 px-3 py-2"
              placeholder="Water reliability, power backup, security, parking, what's the building like…"
            />
          </Field>
        </div>
      </section>

      {error && <div className="rounded-lg bg-red-50 p-4 text-red-700">{error}</div>}

      <div className="flex justify-end gap-3">
        <button type="button" onClick={() => router.back()} className="rounded-lg px-4 py-2 text-ink-700 hover:bg-ink-100">
          Cancel
        </button>
        <button disabled={creating || photos.length < 3} className="rounded-lg bg-brand-500 px-6 py-2 font-semibold text-white hover:bg-brand-600 disabled:opacity-50">
          {creating ? "Creating…" : "Create draft"}
        </button>
      </div>
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
