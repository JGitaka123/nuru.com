"use client";

/**
 * Click-to-place pin picker for the agent listing form. Starts centered
 * on the chosen neighborhood; a click (or dragging the marker) sets the
 * exact coordinates sent to the API.
 */

import { useEffect, useRef } from "react";
import { loadLeaflet, NEIGHBORHOOD_CENTROIDS, DEFAULT_CENTER } from "@/lib/leaflet";

export default function MapPinPicker({
  lat,
  lng,
  neighborhood,
  onChange,
}: {
  lat: number | null;
  lng: number | null;
  neighborhood: string;
  onChange: (lat: number, lng: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const markerRef = useRef<any>(null);
  const mapRef = useRef<any>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    let canceled = false;
    loadLeaflet()
      .then((L) => {
        if (canceled || !ref.current || mapRef.current) return;
        const start: [number, number] =
          lat !== null && lng !== null
            ? [lat, lng]
            : NEIGHBORHOOD_CENTROIDS[neighborhood] ?? DEFAULT_CENTER;
        const map = L.map(ref.current).setView(start, lat !== null ? 16 : 14);
        mapRef.current = map;
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "© OpenStreetMap contributors",
          maxZoom: 19,
        }).addTo(map);

        function place(pLat: number, pLng: number) {
          if (markerRef.current) {
            markerRef.current.setLatLng([pLat, pLng]);
          } else {
            markerRef.current = L.marker([pLat, pLng], { draggable: true }).addTo(map);
            markerRef.current.on("dragend", () => {
              const pos = markerRef.current.getLatLng();
              onChangeRef.current(pos.lat, pos.lng);
            });
          }
        }

        if (lat !== null && lng !== null) place(lat, lng);
        map.on("click", (e: { latlng: { lat: number; lng: number } }) => {
          place(e.latlng.lat, e.latlng.lng);
          onChangeRef.current(e.latlng.lat, e.latlng.lng);
        });
      })
      .catch(() => undefined);

    return () => {
      canceled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // Mount once; neighborhood recentering handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Recenter when the agent switches neighborhood before dropping a pin.
  useEffect(() => {
    if (!mapRef.current || markerRef.current) return;
    const c = NEIGHBORHOOD_CENTROIDS[neighborhood];
    if (c) mapRef.current.setView(c, 14);
  }, [neighborhood]);

  return (
    <div>
      <div ref={ref} className="h-64 w-full overflow-hidden rounded-lg ring-1 ring-ink-200" />
      <p className="mt-1 text-xs text-ink-500">
        {lat !== null && lng !== null
          ? `Pin: ${lat.toFixed(5)}, ${lng.toFixed(5)}`
          : "Click the map to drop a pin on the property (optional but boosts trust)."}
      </p>
    </div>
  );
}
