"use client";

/**
 * Lightweight Leaflet map for search results. CDN-loaded via the shared
 * loader in lib/leaflet. Listings with real PostGIS coordinates are pinned
 * exactly; the rest fall back to neighborhood centroids with a stable
 * per-id jitter.
 */

import { useEffect, useRef, useState } from "react";
import { formatKes } from "@/lib/format";
import { loadLeaflet, NEIGHBORHOOD_CENTROIDS, DEFAULT_CENTER, jitterFor } from "@/lib/leaflet";

interface MapItem {
  id: string;
  title: string;
  neighborhood: string;
  rent_kes_cents: number;
  bedrooms: number;
  lat?: number | null;
  lng?: number | null;
}

export default function MapView({ items }: { items: MapItem[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

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
        let pos: [number, number];
        if (item.lat != null && item.lng != null) {
          pos = [item.lat, item.lng];
        } else {
          const coord = NEIGHBORHOOD_CENTROIDS[item.neighborhood] ?? DEFAULT_CENTER;
          const [ja, jb] = jitterFor(item.id);
          pos = [coord[0] + ja, coord[1] + jb];
        }
        const m = L.marker(pos).addTo(map).bindPopup(
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
    }).catch(() => setFailed(true));

    return () => {
      canceled = true;
      mapInstance?.remove();
    };
  }, [items]);

  if (failed) {
    return (
      <div className="flex h-[420px] w-full items-center justify-center rounded-xl bg-ink-100 text-sm text-ink-400 ring-1 ring-ink-200">
        Map unavailable — check your connection.
      </div>
    );
  }
  return <div ref={ref} className="h-[420px] w-full overflow-hidden rounded-xl ring-1 ring-ink-200" />;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
