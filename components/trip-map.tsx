"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Map,
  AdvancedMarker,
  Pin,
  InfoWindow,
  useMap,
  useMapsLibrary,
  useAdvancedMarkerRef,
} from "@vis.gl/react-google-maps";
import type { AddPoiInput } from "@/lib/itinerary/operations";
import { categoryFromTypes } from "@/lib/places/category";
import { reverseGeocode } from "@/lib/places/reverse-geocode";
import type { RouteLegResult, TripVia, PoiDetail } from "@/lib/api/trips";
import { nearestLeg, type LegPath } from "@/lib/routing/nearest-leg";
import { formatNightLabel, formatNightHover } from "@/lib/itinerary/night-label";
import { PlacePreview } from "@/components/place-preview";
import { useMapsConfig } from "@/components/maps-config";
import { PlaceInfoPopup } from "@/components/place-info-popup";
import { useMapPick } from "@/components/map-pick-context";
import type { PlacePick } from "@/components/place-autocomplete";

export type MapPoint = { lat: number; lng: number; name: string; id?: string; color?: { background: string; border: string } };

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
  dayColors = {},
  onEditPoi,
  onRemovePoi,
  tripId,
  placeDetails = [],
  focusTarget = null,
  canEdit = true,
}: {
  start: MapPoint;
  end?: MapPoint | null;
  pois?: MapPoint[];
  onAddPlace?: (input: AddPoiInput) => void;
  legs?: RouteLegResult[];
  vias?: TripVia[];
  onAddVia?: (afterPoiId: string | null, dayId: string | null, lat: number, lng: number) => void;
  onMoveVia?: (viaId: string, lat: number, lng: number) => void;
  onRemoveVia?: (viaId: string) => void;
  nights?: { dayId: string; lat: number; lng: number; nightNumber: number; date?: string | null; checkoutDate?: string | null }[];
  onMoveNight?: (dayId: string, lat: number, lng: number) => void;
  dayChoices?: { id: string; label: string }[];
  onSetNight?: (dayId: string, lat: number, lng: number) => void;
  preview?: { placeId: string; position: { lat: number; lng: number }; source: "map" | "search" } | null;
  onPreviewPlace?: (placeId: string, position: { lat: number; lng: number }, source: "map" | "search") => void;
  onPreviewClose?: () => void;
  addedPlaceIds?: Set<string>;
  dayColors?: Record<string, string>;
  onEditPoi?: (poiId: string) => void;
  onRemovePoi?: (poiId: string) => void;
  tripId: string;
  placeDetails?: PoiDetail[];
  focusTarget?: { lat: number; lng: number; key: number } | null;
  canEdit?: boolean;
}) {
  const { mapId } = useMapsConfig();
  const map = useMap();
  const placesLib = useMapsLibrary("places");
  const geocodingLib = useMapsLibrary("geocoding");
  const mapPick = useMapPick();
  const geometryLib = useMapsLibrary("geometry");
  const [menu, setMenu] = useState<{ x: number; y: number; lat: number; lng: number; placeId: string | null } | null>(null);
  const [poiMenu, setPoiMenu] = useState<{ x: number; y: number; poiId: string; name: string } | null>(null);
  const [selectedPoiId, setSelectedPoiId] = useState<string | null>(null);

  // Resolve a clicked point to a named place: a Google place (placeId) → its
  // details; an empty point → reverse-geocoded address (fallback: coordinates).
  async function resolvePlace(placeId: string | null, lat: number, lng: number): Promise<PlacePick> {
    let pick: PlacePick = { name: `Pin ${lat.toFixed(4)}, ${lng.toFixed(4)}`, lat, lng, placeId, types: [] };
    if (placeId && placesLib) {
      try {
        const place = new placesLib.Place({ id: placeId });
        await place.fetchFields({ fields: ["location", "displayName", "id", "types"] });
        const loc = place.location;
        pick = {
          name: place.displayName ?? pick.name,
          lat: loc ? loc.lat() : lat,
          lng: loc ? loc.lng() : lng,
          placeId: place.id ?? placeId,
          types: place.types ?? [],
        };
      } catch {
        // keep the coordinate fallback
      }
    } else if (geocodingLib) {
      const r = await reverseGeocode(geocodingLib, lat, lng);
      pick = { name: r.name, lat, lng, placeId: r.placeId, types: [] };
    }
    return pick;
  }

  // Pan/zoom to a freshly opened preview so it's in view (esp. for search picks).
  useEffect(() => {
    if (!map || !preview) return;
    if (!map.getBounds()?.contains(preview.position)) map.panTo(preview.position);
    if ((map.getZoom() ?? 0) < 13) map.setZoom(13);
  }, [map, preview]);

  // Pan to a place/night when its card is clicked in the sidebar. `focusTarget`
  // carries an incrementing key so re-clicking the same location re-pans.
  useEffect(() => {
    if (!map || !focusTarget) return;
    map.panTo({ lat: focusTarget.lat, lng: focusTarget.lng });
    if ((map.getZoom() ?? 0) < 13) map.setZoom(13);
  }, [map, focusTarget]);

  const legPaths: LegPath[] = useMemo(() => {
    if (!geometryLib) return [];
    return legs
      .filter((l) => l.encodedPolyline)
      .map((l) => ({
        afterPoiId: l.afterPoiId,
        dayId: l.dayId,
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

  useEffect(() => {
    if (!poiMenu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPoiMenu(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [poiMenu]);

  const path: MapPoint[] = useMemo(
    () => [start, ...pois, ...(end ? [end] : [])],
    [start, end, pois],
  );
  // Include night markers so a remote overnight is in the initial viewport.
  const boundsPoints: MapPoint[] = useMemo(
    () => [...path, ...(nights ?? []).map((n) => ({ lat: n.lat, lng: n.lng, name: "night" }))],
    [path, nights],
  );
  // Collapse nights at the same spot into one marker (e.g. a 3-night stay), so we
  // show a single pill labelled with the night range instead of stacked circles.
  const nightGroups = useMemo(() => {
    // Keyed by rounded coords. `Map` is shadowed by the vis.gl import, so use a plain object.
    const byLocation: Record<
      string,
      { lat: number; lng: number; dayIds: string[]; entries: { number: number; date?: string | null; checkoutDate?: string | null }[] }
    > = {};
    for (const n of nights ?? []) {
      const key = `${n.lat.toFixed(5)},${n.lng.toFixed(5)}`;
      const g = byLocation[key] ?? { lat: n.lat, lng: n.lng, dayIds: [], entries: [] };
      g.dayIds.push(n.dayId);
      g.entries.push({ number: n.nightNumber, date: n.date, checkoutDate: n.checkoutDate });
      byLocation[key] = g;
    }
    return Object.values(byLocation);
  }, [nights]);

  return (
    <div className={`relative h-full w-full ${mapPick?.armedId ? "map-armed cursor-crosshair" : ""}`}>
    <Map
      defaultCenter={{ lat: start.lat, lng: start.lng }}
      defaultZoom={7}
      mapId={mapId}
      gestureHandling="greedy"
      style={{ width: "100%", height: "100%" }}
      onClick={async (ev) => {
        const placeId = ev.detail.placeId;
        const ll = ev.detail.latLng;
        if (!ll) return;
        // While a field is armed, ANY click fills it: a Google place (placeId) is
        // resolved to its name; an empty point is reverse-geocoded (falling back
        // to its coordinates).
        if (mapPick?.armedId) {
          ev.stop();
          mapPick.consume(await resolvePlace(placeId ?? null, ll.lat, ll.lng));
          return;
        }
        // Unarmed: only a labeled place opens the preview popup. The preview is an
        // add-place affordance, so it stays closed for read-only viewers.
        if (canEdit && placeId && onPreviewPlace) {
          ev.stop();
          setSelectedPoiId(null); // close any open place-info popup
          onPreviewPlace(placeId, { lat: ll.lat, lng: ll.lng }, "map");
        }
      }}
      onContextmenu={(ev) => {
        if (!canEdit) return; // read-only: no add-place / add-via / set-night menu
        const ll = ev.detail.latLng;
        const dom = ev.domEvent as MouseEvent | undefined;
        if (!ll || !dom) return;
        ev.stop();
        dom.preventDefault?.(); // suppress the native browser context menu
        setMenu({ x: dom.clientX, y: dom.clientY, lat: ll.lat, lng: ll.lng, placeId: ev.detail.placeId ?? null });
      }}
    >
      <AdvancedMarker position={start} title={start.name}>
        <Pin background="#16a34a" borderColor="#15803d" glyphColor="#ffffff" />
      </AdvancedMarker>

      {pois.map((p, i) => (
        <PoiMarker
          key={p.id ?? i}
          point={p}
          onSelect={(p) => {
            if (mapPick?.armedId) return; // let the map handler consume the pick
            if (p.id) {
              onPreviewClose?.(); // don't co-open with the basemap preview
              setSelectedPoiId(p.id);
            }
          }}
          onPoiContextMenu={(e, point) => {
            if (!canEdit) return; // read-only: no edit/remove context menu
            if (!point.id) return;
            e.preventDefault();
            e.stopPropagation();
            setMenu(null);
            setPoiMenu({ x: e.clientX, y: e.clientY, poiId: point.id, name: point.name });
          }}
        />
      ))}

      {end && (
        <AdvancedMarker position={end} title={end.name}>
          <Pin background="#dc2626" borderColor="#b91c1c" glyphColor="#ffffff" />
        </AdvancedMarker>
      )}

      <RouteLegs legs={legs} dayColors={dayColors} onAddVia={canEdit ? onAddVia : undefined} />

      {vias.map((v) => (
        <AdvancedMarker
          key={v.id}
          position={{ lat: v.lat, lng: v.lng }}
          draggable={canEdit}
          onDragEnd={(e) => {
            if (!canEdit) return;
            const lat = e.latLng?.lat();
            const lng = e.latLng?.lng();
            if (lat != null && lng != null && onMoveVia) onMoveVia(v.id, lat, lng);
          }}
        >
          <div
            onDoubleClick={(e) => {
              if (!canEdit) return;
              e.stopPropagation();
              onRemoveVia?.(v.id);
            }}
            title={canEdit ? "Double-click to remove this control point" : "Waypoint"}
            style={{
              width: 12,
              height: 12,
              background: "#f59e0b",
              border: "2px solid #b45309",
              transform: "rotate(45deg)",
              cursor: canEdit ? "grab" : "default",
            }}
          />
        </AdvancedMarker>
      ))}

      {nightGroups.map((g) => (
        <NightMarker key={g.dayIds.join("-")} group={g} canEdit={canEdit} onMoveNight={onMoveNight} />
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

      {(() => {
        const sel = selectedPoiId ? placeDetails.find((p) => p.id === selectedPoiId) : null;
        return sel ? (
          <InfoWindow position={{ lat: sel.lat, lng: sel.lng }} onCloseClick={() => setSelectedPoiId(null)}>
            <PlaceInfoPopup
              poi={sel}
              tripId={tripId}
              days={dayChoices}
              canEdit={canEdit}
              onEdit={() => { onEditPoi?.(sel.id); setSelectedPoiId(null); }}
              onRemove={() => { onRemovePoi?.(sel.id); setSelectedPoiId(null); }}
            />
          </InfoWindow>
        ) : null;
      })()}

      <FitBounds points={boundsPoints} />
    </Map>
    {menu && (onAddPlace || legPaths.length > 0 || (dayChoices.length > 0 && onSetNight)) && (
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
          {onAddPlace && (
            <button
              type="button"
              role="menuitem"
              className="block w-full px-3 py-1.5 text-left hover:bg-accent"
              onClick={async () => {
                const { lat, lng, placeId } = menu;
                setMenu(null);
                const p = await resolvePlace(placeId, lat, lng);
                onAddPlace({
                  name: p.name,
                  lat: p.lat,
                  lng: p.lng,
                  placeId: p.placeId,
                  category: categoryFromTypes(p.types),
                  source: "map",
                });
              }}
            >
              ➕ Add to Places
            </button>
          )}
          {legPaths.length > 0 && (
            <button
              type="button"
              role="menuitem"
              className="block w-full px-3 py-1.5 text-left hover:bg-accent"
              onClick={() => {
                const leg = nearestLeg(legPaths, { lat: menu.lat, lng: menu.lng });
                if (leg && onAddVia) onAddVia(leg.afterPoiId, leg.dayId, menu.lat, menu.lng);
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
    {poiMenu && (onEditPoi || onRemovePoi) && (
      <>
        <div
          className="fixed inset-0 z-20"
          onClick={() => setPoiMenu(null)}
          onContextMenu={(e) => {
            e.preventDefault();
            setPoiMenu(null);
          }}
        />
        <div
          role="menu"
          className="fixed z-30 min-w-44 rounded-md border bg-background py-1 text-sm shadow-md"
          style={{ left: poiMenu.x, top: poiMenu.y }}
        >
          <div className="truncate border-b px-3 pb-1 pt-1 text-xs font-medium text-muted-foreground">
            {poiMenu.name}
          </div>
          {onEditPoi && (
            <button
              type="button"
              role="menuitem"
              className="block w-full px-3 py-1.5 text-left hover:bg-accent"
              onClick={() => {
                onEditPoi(poiMenu.poiId);
                setPoiMenu(null);
              }}
            >
              ✎ Edit
            </button>
          )}
          {onRemovePoi && (
            <button
              type="button"
              role="menuitem"
              className="block w-full px-3 py-1.5 text-left text-red-600 hover:bg-accent"
              onClick={() => {
                onRemovePoi(poiMenu.poiId);
                setPoiMenu(null);
              }}
            >
              ✕ Remove
            </button>
          )}
        </div>
      </>
    )}
    </div>
  );
}

// A place pin. `<Pin>` imperatively replaces the marker's content children, so a
// React onContextMenu wrapper can't survive — instead we attach a native
// `contextmenu` listener to the marker's content element (made interactive by
// `clickable`, which sets pointer-events:all on the content).
function PoiMarker({
  point,
  onSelect,
  onPoiContextMenu,
}: {
  point: MapPoint;
  onSelect: (point: MapPoint) => void;
  onPoiContextMenu: (e: MouseEvent, point: MapPoint) => void;
}) {
  const [markerRef, marker] = useAdvancedMarkerRef();
  const dataRef = useRef({ point, onSelect, onPoiContextMenu });
  dataRef.current = { point, onSelect, onPoiContextMenu };

  // Attach native listeners to the marker content (made interactive by `clickable`).
  // `<Pin>` replaces React children, and vis.gl's AdvancedMarker `onClick` (the Maps
  // 'click' event) doesn't fire reliably here — so a DOM `click` listener is used,
  // matching the proven `contextmenu` one.
  useEffect(() => {
    const content = marker?.content;
    if (!content) return;
    const onCtx = (e: Event) => dataRef.current.onPoiContextMenu(e as MouseEvent, dataRef.current.point);
    const onClick = (e: Event) => {
      e.stopPropagation();
      dataRef.current.onSelect(dataRef.current.point);
    };
    content.addEventListener("contextmenu", onCtx);
    content.addEventListener("click", onClick);
    return () => {
      content.removeEventListener("contextmenu", onCtx);
      content.removeEventListener("click", onClick);
    };
  }, [marker]);

  return (
    <AdvancedMarker ref={markerRef} position={point} title={point.name} clickable>
      <Pin
        scale={0.7}
        background={point.color?.background ?? "#64748b"}
        borderColor={point.color?.border ?? "#475569"}
        glyphColor="#ffffff"
      />
    </AdvancedMarker>
  );
}

function RouteLegs({
  legs,
  dayColors = {},
  onAddVia,
}: {
  legs: RouteLegResult[];
  dayColors?: Record<string, string>;
  onAddVia?: (afterPoiId: string | null, dayId: string | null, lat: number, lng: number) => void;
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
          strokeColor: dayColors[leg.dayId ?? ""] ?? "#2563eb",
          strokeOpacity: 0.85,
          strokeWeight: 5,
        });
        line.addListener("click", (e: google.maps.PolyMouseEvent) => {
          if (!e.latLng || !onAddViaRef.current) return;
          onAddViaRef.current(leg.afterPoiId, leg.dayId, e.latLng.lat(), e.latLng.lng());
        });
        line.setMap(map);
        lines.push(line);
      }
    }

    return () => lines.forEach((l) => l.setMap(null));
  }, [map, geometry, legs, dayColors]);

  return null;
}

type NightGroup = { lat: number; lng: number; dayIds: string[]; entries: { number: number; date?: string | null; checkoutDate?: string | null }[] };

/**
 * A night marker (one stay; may cover several consecutive nights at one spot).
 * Uses a custom hover tooltip rather than the native `title` — Advanced Markers
 * don't reliably surface a browser tooltip from their custom HTML content.
 */
function NightMarker({
  group,
  canEdit,
  onMoveNight,
}: {
  group: NightGroup;
  canEdit: boolean;
  onMoveNight?: (dayId: string, lat: number, lng: number) => void;
}) {
  const [hover, setHover] = useState(false);
  const sorted = [...group.entries].sort((a, b) => a.number - b.number);
  const label = formatNightLabel(sorted.map((e) => e.number));
  // Hover: "Night 3 - 11.07 - 12.07" / "Nights 3–5 - 11.07 - 14.07".
  // checkIn = first night's date; checkOut = the morning after the last night.
  const checkIn = sorted[0]?.date ?? null;
  const checkOut = sorted[sorted.length - 1]?.checkoutDate ?? null;
  const tip = formatNightHover(sorted.map((e) => e.number), checkIn, checkOut);

  return (
    <AdvancedMarker
      position={{ lat: group.lat, lng: group.lng }}
      draggable={canEdit}
      onDragEnd={(e) => {
        if (!canEdit) return;
        const lat = e.latLng?.lat();
        const lng = e.latLng?.lng();
        if (lat != null && lng != null && onMoveNight) {
          // Drag moves every night sharing this spot together.
          for (const dayId of group.dayIds) onMoveNight(dayId, lat, lng);
        }
      }}
    >
      <div
        style={{ position: "relative", display: "flex" }}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      >
        {hover && (
          <div
            style={{
              position: "absolute",
              bottom: "calc(100% + 6px)",
              left: "50%",
              transform: "translateX(-50%)",
              padding: "4px 8px",
              borderRadius: 6,
              background: "rgba(17,24,39,.95)",
              color: "#fff",
              fontSize: 11,
              fontWeight: 500,
              lineHeight: 1.3,
              whiteSpace: "nowrap",
              pointerEvents: "none",
              boxShadow: "0 2px 8px rgba(0,0,0,.35)",
              zIndex: 1000,
            }}
          >
            {tip}
          </div>
        )}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            minWidth: 22,
            height: 22,
            padding: "0 6px",
            borderRadius: 9999,
            background: "#4f46e5",
            color: "#fff",
            fontSize: 12,
            fontWeight: 700,
            lineHeight: "22px",
            border: "2px solid #fff",
            boxShadow: "0 1px 3px rgba(0,0,0,.45)",
            cursor: canEdit ? "grab" : "default",
            whiteSpace: "nowrap",
          }}
        >
          {label}
        </div>
      </div>
    </AdvancedMarker>
  );
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
