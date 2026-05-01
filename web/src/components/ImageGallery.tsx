"use client";

/**
 * Image gallery with thumbnails + arrow keys + swipe.
 * No deps. Pointer events for touch + mouse.
 */

import { useEffect, useRef, useState } from "react";
import { photoUrl } from "@/lib/format";

export default function ImageGallery({ keys, alt }: { keys: string[]; alt: string }) {
  const [idx, setIdx] = useState(0);
  const startX = useRef<number | null>(null);

  const safeKeys = keys.filter(Boolean);
  if (safeKeys.length === 0) {
    return <div className="flex aspect-[16/10] w-full items-center justify-center rounded-xl bg-ink-100 text-ink-400">No photo</div>;
  }
  const url = photoUrl(safeKeys[idx])!;

  function next() { setIdx((i) => (i + 1) % safeKeys.length); }
  function prev() { setIdx((i) => (i - 1 + safeKeys.length) % safeKeys.length); }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safeKeys.length]);

  return (
    <div className="space-y-3">
      <div
        className="relative aspect-[16/10] w-full overflow-hidden rounded-xl bg-ink-100 select-none"
        onPointerDown={(e) => { startX.current = e.clientX; }}
        onPointerUp={(e) => {
          if (startX.current === null) return;
          const dx = e.clientX - startX.current;
          if (dx > 50) prev();
          else if (dx < -50) next();
          startX.current = null;
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={`${alt} — photo ${idx + 1}`} className="h-full w-full object-cover" draggable={false} />
        {safeKeys.length > 1 && (
          <>
            <button
              type="button"
              aria-label="Previous photo"
              onClick={prev}
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/85 p-2 shadow hover:bg-white"
            >
              <span aria-hidden="true">‹</span>
            </button>
            <button
              type="button"
              aria-label="Next photo"
              onClick={next}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/85 p-2 shadow hover:bg-white"
            >
              <span aria-hidden="true">›</span>
            </button>
            <div className="absolute bottom-3 right-3 rounded-full bg-black/55 px-2.5 py-1 text-xs font-medium text-white">
              {idx + 1} / {safeKeys.length}
            </div>
          </>
        )}
      </div>

      {safeKeys.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {safeKeys.map((k, i) => (
            <button
              key={k}
              type="button"
              aria-label={`Show photo ${i + 1}`}
              aria-current={i === idx}
              onClick={() => setIdx(i)}
              className={`flex-none overflow-hidden rounded-md transition ${i === idx ? "ring-2 ring-brand-500" : "ring-1 ring-ink-200 hover:ring-brand-300"}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photoUrl(k)!} alt="" className="h-16 w-24 object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
