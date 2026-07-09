"use client";

/**
 * Listing photo with graceful degradation: a broken/unreachable image
 * swaps to the same "No photo" placeholder instead of the browser's
 * broken-image glyph.
 */

import { useEffect, useState } from "react";

export default function ListingPhoto({
  src,
  alt,
  className = "",
}: {
  src: string | null | undefined;
  alt: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);

  if (!src || failed) {
    return (
      <div className={`flex items-center justify-center bg-ink-100 text-sm text-ink-400 ${className}`}>
        <div className="text-center">
          <div className="mx-auto mb-2 h-10 w-10 rounded-md border border-ink-200 bg-surface" aria-hidden="true" />
          <span>No photo yet</span>
        </div>
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} className={className} onError={() => setFailed(true)} draggable={false} />
  );
}
