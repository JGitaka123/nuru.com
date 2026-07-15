"use client";

import { useEffect, useState } from "react";
import MapPinPicker from "@/components/MapPinPicker";
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
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null);

  const [form, setForm] = useState({
    title: "",
    description: "",
    category: "TWO_BR",
    bedrooms: 2,
    bathrooms: 1,
    listingType: "RENT" as "RENT" | "SALE",
    rentKes: 60000,
    salePriceKes: 15000000,
    depositMonths: 2,
    neighborhood: "Kilimani",
    estate: "",
    features: [] as string[],
  });

  // Redirect unauthenticated users after mount — doing this during render
  // causes an SSR/client hydration mismatch.
  useEffect(() => {
    if (!getToken()) router.push("/login");
  }, [router]);

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
          listingType: form.listingType,
          ...(form.listingType === "SALE"
            ? { rentKesCents: 0, salePriceKes: form.salePriceKes }
            : { rentKesCents: form.rentKes * 100 }),
          depositMonths: form.listingType === "SALE" ? 0 : form.depositMonths,
          features: form.features,
          neighborhood: form.neighborhood,
          estate: form.estate || undefined,
          photoKeys: photos.map((p) => p.key),
          primaryPhotoKey: photos[0].key,
          ...(pin ? { lat: pin.lat, lng: pin.lng } : {}),
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

      <section className="rounded-xl bg-surface p-6 ring-1 ring-ink-200">
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

      <section className="grid gap-4 rounded-xl bg-surface p-6 ring-1 ring-ink-200 sm:grid-cols-2">
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
        <Field label="Pin on map (optional)">
          <MapPinPicker
            lat={pin?.lat ?? null}
            lng={pin?.lng ?? null}
            neighborhood={form.neighborhood}
            onChange={(lat, lng) => setPin({ lat, lng })}
          />
        </Field>
        <Field label="Listing for">
          <div className="inline-flex rounded-lg border border-ink-200 bg-ink-50 p-1 text-sm font-medium">
            {(["RENT", "SALE"] as const).map((lt) => (
              <button key={lt} type="button" onClick={() => setForm({ ...form, listingType: lt })}
                className={`rounded-md px-4 py-1.5 transition ${form.listingType === lt ? "bg-ink-900 text-ink-50" : "text-ink-600 hover:text-ink-900"}`}>
                {lt === "RENT" ? "Rent" : "Sale"}
              </button>
            ))}
          </div>
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
        {form.listingType === "SALE" ? (
          <Field label="Asking price (KES)">
            <input
              type="number" min={50000} step={100000} value={form.salePriceKes}
              onChange={(e) => setForm({ ...form, salePriceKes: Number(e.target.value) })}
              className="w-full rounded-lg border border-ink-200 px-3 py-2"
            />
          </Field>
        ) : (
        <Field label="Monthly rent (KES)">
          <input
            type="number" min={5000} step={1000} value={form.rentKes}
            onChange={(e) => setForm({ ...form, rentKes: Number(e.target.value) })}
            className="w-full rounded-lg border border-ink-200 px-3 py-2"
          />
        </Field>
        )}
        {form.listingType === "RENT" && (
        <Field label="Deposit (months)">
          <input
            type="number" min={0} max={6} value={form.depositMonths}
            onChange={(e) => setForm({ ...form, depositMonths: Number(e.target.value) })}
            className="w-full rounded-lg border border-ink-200 px-3 py-2"
          />
        </Field>
        )}
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
