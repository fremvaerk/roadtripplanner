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
import type { RouteLegResult, TripVia } from "@/lib/api/trips";

export type MapPoint = { lat: number; lng: number; name: string; id?: string };

export function TripMap({
  start,
  end,
  pois = [],
  onAddPlace,
  legs = [],
  vias = [],
  onAddVia,
  onMoveVia,
  onRemoveVia,
}: {
  start: MapPoint;
  end?: MapPoint | null;
  pois?: MapPoint[];
  onAddPlace?: (input: AddPoiInput) => void;
  legs?: RouteLegResult[];
  vias?: TripVia[];
  onAddVia?: (afterPoiId: string | null, lat: number, lng: number) => void;
  onMoveVia?: (viaId: string, lat: number, lng: number) => void;
  onRemoveVia?: (viaId: string) => void;
}) {
  const mapId = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID ?? "DEMO_MAP_ID";
  const placesLib = useMapsLibrary("places");
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
        ev.stop();
        const place = new placesLib.Place({ id: placeId });
        await place.fetchFields({ fields: ["location", "displayName", "id", "types"] });
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

      <RouteLegs legs={legs} fallback={path} onAddVia={onAddVia} />

      {vias.map((v) => (
        <AdvancedMarker
          key={v.id}
          position={{ lat: v.lat, lng: v.lng }}
          draggable
          onDragEnd={(e) => {
            const lat = e.latLng?.lat();
            const lng = e.latLng?.lng();
            if (lat != null && lng != null && onMoveVia) onMoveVia(v.id, lat, lng);
          }}
        >
          <div
            onDoubleClick={(e) => {
              e.stopPropagation();
              onRemoveVia?.(v.id);
            }}
            title="Double-click to remove this control point"
            style={{
              width: 12,
              height: 12,
              background: "#f59e0b",
              border: "2px solid #b45309",
              transform: "rotate(45deg)",
              cursor: "grab",
            }}
          />
        </AdvancedMarker>
      ))}

      <FitBounds points={path} />
    </Map>
  );
}

function RouteLegs({
  legs,
  fallback,
  onAddVia,
}: {
  legs: RouteLegResult[];
  fallback: MapPoint[];
  onAddVia?: (afterPoiId: string | null, lat: number, lng: number) => void;
}) {
  const map = useMap();
  const geometry = useMapsLibrary("geometry");
  const onAddViaRef = useRef(onAddVia);
  onAddViaRef.current = onAddVia;

  useEffect(() => {
    if (!map) return;
    const lines: google.maps.Polyline[] = [];

    const encodedLegs = legs.filter((l) => l.encodedPolyline);
    if (encodedLegs.length && geometry) {
      for (const leg of encodedLegs) {
        const coords = geometry.encoding
          .decodePath(leg.encodedPolyline as string)
          .map((p) => ({ lat: p.lat(), lng: p.lng() }));
        const line = new google.maps.Polyline({
          path: coords,
          clickable: true,
          strokeColor: "#2563eb",
          strokeOpacity: 0.85,
          strokeWeight: 5,
        });
        line.addListener("click", (e: google.maps.PolyMouseEvent) => {
          if (!e.latLng || !onAddViaRef.current) return;
          onAddViaRef.current(leg.afterPoiId, e.latLng.lat(), e.latLng.lng());
        });
        line.setMap(map);
        lines.push(line);
      }
    } else if (fallback.length >= 2) {
      const line = new google.maps.Polyline({
        path: fallback.map((p) => ({ lat: p.lat, lng: p.lng })),
        geodesic: true,
        strokeColor: "#2563eb",
        strokeOpacity: 0.85,
        strokeWeight: 4,
      });
      line.setMap(map);
      lines.push(line);
    }

    return () => lines.forEach((l) => l.setMap(null));
  }, [map, geometry, legs, fallback]);

  return null;
}

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
