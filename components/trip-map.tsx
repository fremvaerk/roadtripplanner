"use client";

import { useEffect } from "react";
import {
  APIProvider,
  Map,
  AdvancedMarker,
  Pin,
  useMap,
} from "@vis.gl/react-google-maps";

export type MapPoint = { lat: number; lng: number; name: string; id?: string };

export function TripMap({
  start,
  end,
  pois = [],
}: {
  start: MapPoint;
  end?: MapPoint | null;
  pois?: MapPoint[];
}) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
  const mapId = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID ?? "DEMO_MAP_ID";
  const path: MapPoint[] = [start, ...pois, ...(end ? [end] : [])];

  if (!apiKey) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to show the map.
      </div>
    );
  }

  return (
    <APIProvider apiKey={apiKey}>
      <Map
        defaultCenter={{ lat: start.lat, lng: start.lng }}
        defaultZoom={7}
        mapId={mapId}
        gestureHandling="greedy"
        style={{ width: "100%", height: "100%" }}
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
    </APIProvider>
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

function FitBounds({ points }: { points: MapPoint[] }) {
  const map = useMap();
  useEffect(() => {
    if (!map || points.length === 0) return;
    const bounds = new google.maps.LatLngBounds();
    points.forEach((p) => bounds.extend({ lat: p.lat, lng: p.lng }));
    if (points.length === 1) {
      map.setCenter({ lat: points[0].lat, lng: points[0].lng });
      map.setZoom(10);
    } else {
      map.fitBounds(bounds, 64);
    }
  }, [map, points]);
  return null;
}
