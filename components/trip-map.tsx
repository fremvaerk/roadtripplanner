"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Map,
  AdvancedMarker,
  Pin,
  InfoWindow,
  useMap,
  useMapsLibrary,
} from "@vis.gl/react-google-maps";
import type { AddPoiInput } from "@/lib/itinerary/operations";
import type { RouteLegResult, TripVia } from "@/lib/api/trips";
import { nearestLeg, type LegPath } from "@/lib/routing/nearest-leg";
import { PlacePreview } from "@/components/place-preview";

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
  nights = [],
  onMoveNight,
  dayChoices = [],
  onSetNight,
  preview = null,
  onPreviewPlace,
  onPreviewClose,
  addedPlaceIds,
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
  nights?: { dayId: string; lat: number; lng: number }[];
  onMoveNight?: (dayId: string, lat: number, lng: number) => void;
  dayChoices?: { id: string; label: string }[];
  onSetNight?: (dayId: string, lat: number, lng: number) => void;
  preview?: { placeId: string; position: { lat: number; lng: number }; source: "map" | "search" } | null;
  onPreviewPlace?: (placeId: string, position: { lat: number; lng: number }, source: "map" | "search") => void;
  onPreviewClose?: () => void;
  addedPlaceIds?: Set<string>;
}) {
  const mapId = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID ?? "DEMO_MAP_ID";
  const map = useMap();
  const geometryLib = useMapsLibrary("geometry");
  const [menu, setMenu] = useState<{ x: number; y: number; lat: number; lng: number } | null>(null);

  // Pan/zoom to a freshly opened preview so it's in view (esp. for search picks).
  useEffect(() => {
    if (!map || !preview) return;
    if (!map.getBounds()?.contains(preview.position)) map.panTo(preview.position);
    if ((map.getZoom() ?? 0) < 13) map.setZoom(13);
  }, [map, preview]);

  const legPaths: LegPath[] = useMemo(() => {
    if (!geometryLib) return [];
    return legs
      .filter((l) => l.encodedPolyline)
      .map((l) => ({
        afterPoiId: l.afterPoiId,
        coords: geometryLib.encoding
          .decodePath(l.encodedPolyline as string)
          .map((p) => ({ lat: p.lat(), lng: p.lng() })),
      }));
  }, [geometryLib, legs]);

  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menu]);

  const path: MapPoint[] = useMemo(
    () => [start, ...pois, ...(end ? [end] : [])],
    [start, end, pois],
  );
  // Include night markers so a remote overnight is in the initial viewport.
  const boundsPoints: MapPoint[] = useMemo(
    () => [...path, ...(nights ?? []).map((n) => ({ lat: n.lat, lng: n.lng, name: "night" }))],
    [path, nights],
  );

  return (
    <div className="relative h-full w-full">
    <Map
      defaultCenter={{ lat: start.lat, lng: start.lng }}
      defaultZoom={7}
      mapId={mapId}
      gestureHandling="greedy"
      style={{ width: "100%", height: "100%" }}
      onClick={(ev) => {
        const placeId = ev.detail.placeId;
        const ll = ev.detail.latLng;
        if (!placeId || !ll || !onPreviewPlace) return;
        ev.stop();
        onPreviewPlace(placeId, { lat: ll.lat, lng: ll.lng }, "map");
      }}
      onContextmenu={(ev) => {
        const ll = ev.detail.latLng;
        const dom = ev.domEvent as MouseEvent | undefined;
        if (!ll || !dom) return;
        ev.stop();
        dom.preventDefault?.(); // suppress the native browser context menu
        setMenu({ x: dom.clientX, y: dom.clientY, lat: ll.lat, lng: ll.lng });
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

      {(nights ?? []).map((n) => (
        <AdvancedMarker
          key={n.dayId}
          position={{ lat: n.lat, lng: n.lng }}
          draggable
          onDragEnd={(e) => {
            const lat = e.latLng?.lat();
            const lng = e.latLng?.lng();
            if (lat != null && lng != null && onMoveNight) onMoveNight(n.dayId, lat, lng);
          }}
          title="Night stop (drag to move where you sleep)"
        >
          <div
            style={{
              fontSize: 18,
              lineHeight: "18px",
              cursor: "grab",
              filter: "drop-shadow(0 1px 1px rgba(0,0,0,.4))",
            }}
          >
            🛏️
          </div>
        </AdvancedMarker>
      ))}

      {preview && (
        <InfoWindow position={preview.position} onCloseClick={() => onPreviewClose?.()}>
          <PlacePreview
            placeId={preview.placeId}
            position={preview.position}
            source={preview.source}
            alreadyAdded={addedPlaceIds?.has(preview.placeId) ?? false}
            onAdd={(input) => onAddPlace?.(input)}
          />
        </InfoWindow>
      )}

      <FitBounds points={boundsPoints} />
    </Map>
    {menu && (legPaths.length > 0 || (dayChoices.length > 0 && onSetNight)) && (
      <>
        <div
          className="fixed inset-0 z-20"
          onClick={() => setMenu(null)}
          onContextMenu={(e) => {
            e.preventDefault();
            setMenu(null);
          }}
        />
        <div
          role="menu"
          className="fixed z-30 min-w-44 rounded-md border bg-background py-1 text-sm shadow-md"
          style={{ left: menu.x, top: menu.y }}
        >
          {legPaths.length > 0 && (
            <button
              type="button"
              role="menuitem"
              className="block w-full px-3 py-1.5 text-left hover:bg-accent"
              onClick={() => {
                const leg = nearestLeg(legPaths, { lat: menu.lat, lng: menu.lng });
                if (leg && onAddVia) onAddVia(leg.afterPoiId, menu.lat, menu.lng);
                setMenu(null);
              }}
            >
              ➕ Add waypoint here
            </button>
          )}
          {dayChoices.length > 0 && onSetNight && (
            <>
              <div className="border-t px-3 pb-1 pt-2 text-xs text-muted-foreground">
                Set night for:
              </div>
              {dayChoices.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  role="menuitem"
                  className="block w-full px-3 py-1.5 text-left hover:bg-accent"
                  onClick={() => {
                    onSetNight(d.id, menu.lat, menu.lng);
                    setMenu(null);
                  }}
                >
                  🛏️ {d.label}
                </button>
              ))}
            </>
          )}
        </div>
      </>
    )}
    </div>
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
