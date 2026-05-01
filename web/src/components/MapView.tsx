"use client";

/**
 * Lightweight Leaflet map. We inject Leaflet's CSS + JS from unpkg on
 * mount so the home/listing bundles don't pay for it. Once `npm i leaflet`
 * is added, swap to `import L from "leaflet"`.
 *
 * For listings without coordinates, we approximate from neighborhood
 * centroids. When PostGIS lat/lng is exposed via the API per listing
 * we'll switch to real positions.
 */

import { useEffect, useRef } from "react";
import { formatKes } from "@/lib/format";

const NEIGHBORHOOD_CENTROIDS: Record<string, [number, number]> = {
  Kilimani: [-1.2912, 36.7834],
  Westlands: [-1.2670, 36.8074],
  Kileleshwa: [-1.2720, 36.7876],
  Lavington: [-1.2768, 36.7651],
  Parklands: [-1.2630, 36.8186],
  Karen: [-1.3197, 36.7068],
  Runda: [-1.2155, 36.8076],
  "Spring Valley": [-1.2581, 36.7821],
  Riverside: [-1.2694, 36.8011],
  Hurlingham: [-1.2967, 36.7902],
  Upperhill: [-1.2933, 36.8111],
  "South B": [-1.3167, 36.8400],
  "South C": [-1.3257, 36.8329],
  "Lang'ata": [-1.3501, 36.7551],
};
const DEFAULT_CENTER: [number, number] = [-1.286, 36.819];

interface MapItem {
  id: string;
  title: string;
  neighborhood: string;
  rent_kes_cents: number;
  bedrooms: number;
}

declare global {
  interface Window {
    L?: typeof import("leaflet");
  }
}

function loadLeaflet(): Promise<typeof import("leaflet")> {
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
        if (window.L) { clearInterval(wait); resolve(window.L); }
      }, 50);
      return;
    }
    const s = document.createElement("script");
    s.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    s.async = true;
    s.crossOrigin = "anonymous";
    s.dataset.leaflet = "1";
    s.onload = () => window.L ? resolve(window.L) : reject(new Error("leaflet missing after load"));
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

export default function MapView({ items }: { items: MapItem[] }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let canceled = false;
    let mapInstance: { remove: () => void } | null = null;

    loadLeaflet().then((L) => {
      if (canceled || !ref.current) return;
      const map = L.map(ref.current, { zoomControl: true }).setView(DEFAULT_CENTER, 12);
      mapInstance = map;
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors",
        maxZoom: 19,
      }).addTo(map);

      const markers: ReturnType<typeof L.marker>[] = [];
      for (const item of items) {
        const coord = NEIGHBORHOOD_CENTROIDS[item.neighborhood] ?? DEFAULT_CENTER;
        const m = L.marker([
          coord[0] + (Math.random() - 0.5) * 0.004,
          coord[1] + (Math.random() - 0.5) * 0.004,
        ]).addTo(map).bindPopup(
          `<div style="font-family:system-ui,sans-serif">
             <strong>${escapeHtml(item.title)}</strong><br/>
             ${escapeHtml(item.neighborhood)} · ${item.bedrooms}BR · ${formatKes(item.rent_kes_cents)}/mo
             <div style="margin-top:6px"><a href="/listing/${item.id}">View →</a></div>
           </div>`,
        );
        markers.push(m);
      }
      if (markers.length > 0) {
        const group = L.featureGroup(markers);
        map.fitBounds(group.getBounds().pad(0.2));
      }
    }).catch(() => undefined);

    return () => {
      canceled = true;
      mapInstance?.remove();
    };
  }, [items]);

  return <div ref={ref} className="h-[420px] w-full overflow-hidden rounded-xl ring-1 ring-ink-200" />;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
