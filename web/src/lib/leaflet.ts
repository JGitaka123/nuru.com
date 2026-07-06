"use client";

/**
 * Shared CDN Leaflet loader + Nairobi geo constants.
 * We deliberately avoid the npm package — the map is a progressive
 * enhancement and the bundle shouldn't pay for it.
 */

export type LeafletNS = any;

declare global {
  interface Window {
    L?: LeafletNS;
  }
}

export const NEIGHBORHOOD_CENTROIDS: Record<string, [number, number]> = {
  Kilimani: [-1.2912, 36.7834],
  Westlands: [-1.267, 36.8074],
  Kileleshwa: [-1.272, 36.7876],
  Lavington: [-1.2768, 36.7651],
  Parklands: [-1.263, 36.8186],
  Karen: [-1.3197, 36.7068],
  Runda: [-1.2155, 36.8076],
  "Spring Valley": [-1.2581, 36.7821],
  Riverside: [-1.2694, 36.8011],
  Hurlingham: [-1.2967, 36.7902],
  Upperhill: [-1.2933, 36.8111],
  "South B": [-1.3167, 36.84],
  "South C": [-1.3257, 36.8329],
  "Lang'ata": [-1.3501, 36.7551],
};

export const DEFAULT_CENTER: [number, number] = [-1.286, 36.819];

export function loadLeaflet(): Promise<LeafletNS> {
  if (typeof window === "undefined") return Promise.reject(new Error("ssr"));
  if (window.L) return Promise.resolve(window.L);
  return new Promise((resolve, reject) => {
    if (!document.querySelector('link[data-leaflet="1"]')) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      link.dataset.leaflet = "1";
      link.crossOrigin = "anonymous";
      document.head.appendChild(link);
    }
    if (document.querySelector('script[data-leaflet="1"]')) {
      const wait = setInterval(() => {
        if (window.L) {
          clearInterval(wait);
          resolve(window.L);
        }
      }, 50);
      return;
    }
    const s = document.createElement("script");
    s.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    s.async = true;
    s.crossOrigin = "anonymous";
    s.dataset.leaflet = "1";
    s.onload = () => (window.L ? resolve(window.L) : reject(new Error("leaflet missing after load")));
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

/** Deterministic per-id jitter so centroid-fallback pins don't dance on re-render. */
export function jitterFor(id: string): [number, number] {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  const a = ((h & 0xffff) / 0xffff - 0.5) * 0.004;
  const b = (((h >> 16) & 0xffff) / 0xffff - 0.5) * 0.004;
  return [a, b];
}
