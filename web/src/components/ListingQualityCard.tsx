"use client";

/**
 * Actionable photo/listing feedback from the AI vision pass.
 *
 * The enrichment worker already computes quality issues and missing rooms —
 * this surfaces them to the agent so they can fix the listing before it goes
 * live, instead of the feedback being discarded.
 */

const ISSUE_COPY: Record<string, { label: string; fix: string }> = {
  watermark_detected: {
    label: "Watermark or other-site logo detected",
    fix: "Re-shoot or upload the original photos. Watermarked images look like stolen listings and block publishing.",
  },
  low_resolution: { label: "Low-resolution photos", fix: "Upload the full-size originals from your phone or camera." },
  dark_photos: { label: "Photos are too dark", fix: "Re-shoot during the day with curtains open and lights on." },
  blurry: { label: "Blurry photos", fix: "Hold steady or use a tripod — tap to focus before shooting." },
  cluttered: { label: "Rooms look cluttered", fix: "Tidy the space before shooting; empty rooms photograph better." },
  too_few_photos: { label: "Too few photos", fix: "Aim for at least 6 — listings with more photos get more inquiries." },
  text_overlay: { label: "Text overlay on photos", fix: "Upload clean photos without prices or phone numbers burned in." },
};

function humanize(s: string): string {
  return s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

export interface ListingQuality {
  aiQualityIssues?: string[] | null;
  aiMissingPhotos?: string[] | null;
  aiQualityScore?: number | null;
  aiPricingNotes?: string | null;
  aiEnrichedAt?: string | null;
}

export default function ListingQualityCard({ listing }: { listing: ListingQuality }) {
  const issues = listing.aiQualityIssues ?? [];
  const missing = listing.aiMissingPhotos ?? [];
  const notes = listing.aiPricingNotes;

  // Nothing useful to say yet (not enriched, or a clean listing with no notes).
  if (!listing.aiEnrichedAt) return null;
  if (issues.length === 0 && missing.length === 0 && !notes) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
        <p className="font-medium text-emerald-900">✓ Photos look good</p>
        <p className="mt-1 text-sm text-emerald-800">
          Our review found no issues with this listing&apos;s photos.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-ink-200 bg-surface p-5 shadow-card sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-serif text-lg text-ink-900">Improve this listing</h2>
        {typeof listing.aiQualityScore === "number" && (
          <span className="text-xs text-ink-500">
            Quality score {Math.round(listing.aiQualityScore * 100)}/100
          </span>
        )}
      </div>

      {issues.length > 0 && (
        <ul className="mt-4 space-y-3">
          {issues.map((code) => {
            const copy = ISSUE_COPY[code];
            return (
              <li key={code} className="flex gap-3">
                <span aria-hidden="true" className="mt-0.5 text-amber-500">⚠</span>
                <div>
                  <p className="font-medium text-ink-900">{copy?.label ?? humanize(code)}</p>
                  {copy?.fix && <p className="mt-0.5 text-sm text-ink-600">{copy.fix}</p>}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {missing.length > 0 && (
        <div className="mt-5 rounded-xl bg-ink-50 p-4">
          <p className="text-sm font-medium text-ink-900">Add photos of:</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {missing.map((room) => (
              <span key={room} className="rounded-full border border-ink-200 bg-surface px-3 py-1 text-sm text-ink-700">
                {humanize(room)}
              </span>
            ))}
          </div>
          <p className="mt-2.5 text-xs text-ink-500">
            Listings with a full set of rooms get noticeably more inquiries.
          </p>
        </div>
      )}

      {notes && (
        <p className="mt-5 border-t border-ink-100 pt-4 text-sm text-ink-600">
          <span className="font-medium text-ink-900">Pricing: </span>{notes}
        </p>
      )}
    </div>
  );
}
