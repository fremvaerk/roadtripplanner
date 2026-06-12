"use client";

import { useEffect, useMemo } from "react";
import { Map, AdvancedMarker, useMap, useMapsLibrary } from "@vis.gl/react-google-maps";
import type { ExportDay, ExportPoint } from "@/lib/export/itinerary-model";
import { useMapsConfig } from "@/components/maps-config";

/**
 * A lightweight, read-only map for a single day of a trip, used by the mobile
 * navigation companion. Self-contained and intentionally NOT the heavy editing
 * `components/trip-map.tsx` — no context menus, no add/edit UI, no APIProvider
 * (the parent provides `<APIProvider>`).
 */
export function CompanionMap({
  day,
  start,
  focusTarget = null,
}: {
  day: ExportDay;
  start: ExportPoint;
  focusTarget?: { lat: number; lng: number; key: number } | null;
}) {
  const { mapId } = useMapsConfig();

  // Where the day begins (previous night / trip start), then its stops and night.
  // `day` is referentially stable (the export model is memoized in the parent), so
  // memoizing keeps `pts` stable across focus-tap re-renders — otherwise DayRoute /
  // FitBounds would re-run on every tap and yank the viewport back to the day bounds.
  const origin = day.origin ?? start;
  const pts = useMemo(
    () => [origin, ...day.stops, ...(day.night ? [day.night] : [])],
    [day, origin],
  );

  return (
    <Map
      defaultCenter={day.stops[0] ?? origin}
      defaultZoom={9}
      mapId={mapId}
      gestureHandling="greedy"
      style={{ width: "100%", height: "100%" }}
    >
      <DayRoute day={day} pts={pts} />

      {/* Start-of-day marker: a small circle labelled "S". */}
      <AdvancedMarker position={origin} title={origin.name}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 22,
            height: 22,
            borderRadius: 9999,
            background: "#16a34a",
            color: "#fff",
            fontSize: 12,
            fontWeight: 700,
            lineHeight: "22px",
            border: "2px solid #fff",
            boxShadow: "0 1px 3px rgba(0,0,0,.45)",
          }}
        >
          S
        </div>
      </AdvancedMarker>

      {/* Numbered stop markers (1..n), styled like trip-map's night pill but
          using the day's color as the background. */}
      {day.stops.map((stop, i) => (
        <AdvancedMarker key={stop.id ?? i} position={stop} title={stop.name}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              minWidth: 22,
              height: 22,
              padding: "0 6px",
              borderRadius: 9999,
              background: day.color,
              color: "#fff",
              fontSize: 12,
              fontWeight: 700,
              lineHeight: "22px",
              border: "2px solid #fff",
              boxShadow: "0 1px 3px rgba(0,0,0,.45)",
              whiteSpace: "nowrap",
            }}
          >
            {i + 1}
          </div>
        </AdvancedMarker>
      ))}

      {/* Night marker (distinct: a bed emoji). */}
      {day.night && (
        <AdvancedMarker position={day.night} title={`Night: ${day.night.name}`}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 24,
              height: 24,
              borderRadius: 9999,
              background: "#4f46e5",
              fontSize: 13,
              lineHeight: "24px",
              border: "2px solid #fff",
              boxShadow: "0 1px 3px rgba(0,0,0,.45)",
            }}
          >
            🛏
          </div>
        </AdvancedMarker>
      )}

      <FitBounds day={day} pts={pts} />
      <Focus focusTarget={focusTarget} />
    </Map>
  );
}

/**
 * Draws the day's route as a single polyline, mirroring trip-map.tsx's
 * `RouteLegs`: a `useMap()` + `useMapsLibrary("maps")` child that imperatively
 * creates a `google.maps.Polyline` in an effect and tears it down on cleanup.
 * Falls back to straight lines through the day's points when no decoded route.
 */
function DayRoute({ day, pts }: { day: ExportDay; pts: ExportPoint[] }) {
  const map = useMap();
  const mapsLib = useMapsLibrary("maps");

  useEffect(() => {
    if (!map || !mapsLib) return;
    const path = day.path.length > 1 ? day.path : pts;
    const polyline = new mapsLib.Polyline({
      path,
      strokeColor: day.color,
      strokeWeight: 5,
      strokeOpacity: 0.9,
      map,
    });
    return () => polyline.setMap(null);
  }, [map, mapsLib, day.path, day.color, pts]);

  return null;
}

/**
 * Fits the map to the day's points, mirroring trip-map.tsx's `FitBounds`:
 * extend a `LatLngBounds` with every point and `fitBounds(bounds, 48)`. Guards
 * the single-point case with `setCenter` + a sensible zoom. Re-fits when the
 * day changes (keyed on `day.index`).
 */
function FitBounds({ day, pts }: { day: ExportDay; pts: ExportPoint[] }) {
  const map = useMap();
  const coreLib = useMapsLibrary("core");
  useEffect(() => {
    if (!map || !coreLib || pts.length === 0) return;
    if (pts.length === 1) {
      map.setCenter({ lat: pts[0].lat, lng: pts[0].lng });
      map.setZoom(12);
      return;
    }
    const bounds = new coreLib.LatLngBounds();
    pts.forEach((p) => bounds.extend({ lat: p.lat, lng: p.lng }));
    day.path.forEach((p) => bounds.extend({ lat: p.lat, lng: p.lng }));
    map.fitBounds(bounds, 48);
    // `pts` is memoized in the parent, so this re-fits only when the day changes,
    // not on every render — letting a focus-tap pan survive.
  }, [map, coreLib, day.path, pts]);
  return null;
}

/**
 * Pans to a focus target when its incrementing `key` changes, mirroring
 * trip-map.tsx's focus effect. No-op while `focusTarget` is null.
 */
function Focus({ focusTarget }: { focusTarget: { lat: number; lng: number; key: number } | null }) {
  const map = useMap();
  useEffect(() => {
    if (!map || !focusTarget) return;
    map.panTo({ lat: focusTarget.lat, lng: focusTarget.lng });
    if ((map.getZoom() ?? 0) < 14) map.setZoom(14);
  }, [map, focusTarget]);
  return null;
}
