"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  Map,
  AdvancedMarker,
  Pin,
  useMap,
  useMapsLibrary,
} from "@vis.gl/react-google-maps";
import type { AddPoiInput } from "@/lib/itinerary/operations";
import { categoryFromTypes } from "@/lib/places/category";

export type MapPoint = { lat: number; lng: number; name: string; id?: string };

// Renders inside an <APIProvider> supplied by the planner (so this and the
// search box share one Maps JS context).
export function TripMap({
  start,
  end,
  pois = [],
  onAddPlace,
}: {
  start: MapPoint;
  end?: MapPoint | null;
  pois?: MapPoint[];
  onAddPlace?: (input: AddPoiInput) => void;
}) {
  const mapId = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID ?? "DEMO_MAP_ID";
  const placesLib = useMapsLibrary("places");
  // Memoize so RoutePolyline/FitBounds effects don't tear down on every render.
  const path: MapPoint[] = useMemo(
    () => [start, ...pois, ...(end ? [end] : [])],
    [start, end, pois],
  );

  return (
    <Map
      defaultCenter={{ lat: start.lat, lng: start.lng }}
      defaultZoom={7}
      mapId={mapId}
      gestureHandling="greedy"
      style={{ width: "100%", height: "100%" }}
      onClick={async (ev) => {
        const placeId = ev.detail.placeId;
        if (!placeId || !onAddPlace || !placesLib) return;
        ev.stop(); // suppress the default place info window
        const place = new placesLib.Place({ id: placeId });
        await place.fetchFields({
          fields: ["location", "displayName", "id", "types"],
        });
        const loc = place.location;
        if (!loc) return;
        onAddPlace({
          name: place.displayName ?? "Unnamed place",
          lat: loc.lat(),
          lng: loc.lng(),
          placeId: place.id ?? null,
          category: categoryFromTypes(place.types ?? []),
          source: "map",
        });
      }}
    >
      <AdvancedMarker position={start} title={start.name}>
        <Pin background="#16a34a" borderColor="#15803d" glyphColor="#ffffff" />
      </AdvancedMarker>

      {pois.map((p, i) => (
        <AdvancedMarker key={p.id ?? i} position={p} title={p.name}>
          <Pin />
        </AdvancedMarker>
      ))}

      {end && (
        <AdvancedMarker position={end} title={end.name}>
          <Pin background="#dc2626" borderColor="#b91c1c" glyphColor="#ffffff" />
        </AdvancedMarker>
      )}

      <RoutePolyline path={path} />
      <FitBounds points={path} />
    </Map>
  );
}

function RoutePolyline({ path }: { path: MapPoint[] }) {
  const map = useMap();
  useEffect(() => {
    if (!map || path.length < 2) return;
    const line = new google.maps.Polyline({
      path: path.map((p) => ({ lat: p.lat, lng: p.lng })),
      geodesic: true,
      strokeColor: "#2563eb",
      strokeOpacity: 0.85,
      strokeWeight: 3,
    });
    line.setMap(map);
    return () => line.setMap(null);
  }, [map, path]);
  return null;
}

// Fit the viewport once, on first load — don't snap back after the user pans
// and then adds a place.
function FitBounds({ points }: { points: MapPoint[] }) {
  const map = useMap();
  const hasFit = useRef(false);
  useEffect(() => {
    if (!map || points.length === 0 || hasFit.current) return;
    if (points.length === 1) {
      map.setCenter({ lat: points[0].lat, lng: points[0].lng });
      map.setZoom(10);
    } else {
      const bounds = new google.maps.LatLngBounds();
      points.forEach((p) => bounds.extend({ lat: p.lat, lng: p.lng }));
      map.fitBounds(bounds, 64);
    }
    hasFit.current = true;
  }, [map, points]);
  return null;
}
