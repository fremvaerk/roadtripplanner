"use client";

import { useState, useEffect, useMemo } from "react";
import { APIProvider } from "@vis.gl/react-google-maps";
import { DragDropProvider } from "@dnd-kit/react";
import { move } from "@dnd-kit/helpers";
import { TripMap, type MapPoint } from "@/components/trip-map";
import { PoiContainer } from "@/components/poi-container";
import { MasterList } from "@/components/master-list";
import { Button } from "@/components/ui/button";
import { useTrip } from "@/hooks/use-trip";
import { useRoute } from "@/hooks/use-route";
import { useAddPoi, useMovePoi, useOptimizeDay, useBuildSplit, useResplit } from "@/hooks/use-poi-mutations";
import { useAddVia, useMoveVia, useRemoveVia } from "@/hooks/use-via-mutations";
import { DayNight } from "@/components/day-night";
import { useUpdateNight, useSetNight } from "@/hooks/use-night-mutations";
import { dayDate } from "@/lib/dates";
import { useAddDay, useRemoveDay, useSetStartDate } from "@/hooks/use-day-mutations";
import { PlaceAutocomplete } from "@/components/place-autocomplete";
import { useUpdateTripBase, useSetTripTitle } from "@/hooks/use-trip-mutations";
import Link from "next/link";
import type { AddPoiInput } from "@/lib/itinerary/operations";
import { darken, UNGROUPED_COLOR } from "@/lib/places/group-colors";
import { MapPickProvider } from "@/components/map-pick-context";

function formatDuration(seconds: number): string {
  if (!seconds) return "0 min";
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (h && m) return `${h} h ${m} min`;
  if (h) return `${h} h`;
  return `${m} min`;
}

function formatKm(meters: number): string {
  return `${Math.round(meters / 1000)} km`;
}

const DATE_FMT = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
function formatDayDate(startDate: string | null, dayIndex: number): string | null {
  const d = dayDate(startDate, dayIndex);
  return d ? DATE_FMT.format(d) : null;
}

export function PlannerShell({ tripId }: { tripId: string }) {
  const { data: trip, isLoading, isError } = useTrip(tripId);
  const { data: route } = useRoute(tripId);
  const addPoi = useAddPoi(tripId);
  const movePoi = useMovePoi(tripId);
  const optimizeDay = useOptimizeDay(tripId);
  const buildSplit = useBuildSplit(tripId);
  const resplit = useResplit(tripId);
  const addVia = useAddVia(tripId);
  const moveVia = useMoveVia(tripId);
  const removeVia = useRemoveVia(tripId);
  const updateNight = useUpdateNight(tripId);
  const setNight = useSetNight(tripId);
  const addDay = useAddDay(tripId);
  const removeDay = useRemoveDay(tripId);
  const setStartDate = useSetStartDate(tripId);
  const updateBase = useUpdateTripBase(tripId);
  const setTitle = useSetTripTitle(tripId);
  const [pendingMode, setPendingMode] = useState<null | "open" | "round" | "place">(null);
  const [preview, setPreview] = useState<
    { placeId: string; position: { lat: number; lng: number }; source: "map" | "search" } | null
  >(null);
  const addedPlaceIds = useMemo(
    () => new Set((trip?.pois ?? []).map((p) => p.placeId).filter((x): x is string => !!x)),
    [trip?.pois],
  );

  // Drop the optimistic override once the server reflects the new finish.
  useEffect(() => {
    setPendingMode(null);
  }, [trip?.endLat, trip?.endLng, trip?.isRoundTrip]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-muted-foreground">
        Loading trip…
      </div>
    );
  }
  if (isError || !trip) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-red-600">
        Couldn’t load this trip.
      </div>
    );
  }

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
  const start: MapPoint = { lat: trip.startLat, lng: trip.startLng, name: trip.startName };
  const end: MapPoint | null =
    trip.endLat != null && trip.endLng != null
      ? { lat: trip.endLat, lng: trip.endLng, name: trip.endName ?? "End" }
      : null;
  const groupColorById = new Map(trip.poiGroups.map((g) => [g.id, g.color]));
  const poiPoints: MapPoint[] = trip.pois.map((p) => {
    const bg = (p.groupId && groupColorById.get(p.groupId)) || UNGROUPED_COLOR;
    return { lat: p.lat, lng: p.lng, name: p.name, id: p.id, color: { background: bg, border: darken(bg) } };
  });

  const byDay = (dayId: string | null) =>
    trip.pois
      .filter((p) => p.dayId === dayId)
      .sort((a, b) => (a.orderInDay ?? 0) - (b.orderInDay ?? 0));
  const unscheduledCount = byDay(null).length;
  const assignedCount = trip.pois.length - unscheduledCount;

  const dayGroups: Record<string, string[]> = {};
  for (const day of trip.days) dayGroups[day.id] = byDay(day.id).map((p) => p.id);

  function handleAddFromMap(input: AddPoiInput) {
    addPoi.mutate({
      name: input.name,
      lat: input.lat,
      lng: input.lng,
      placeId: input.placeId ?? undefined,
      category: input.category ?? undefined,
      source: input.source ?? "map",
      address: input.address ?? undefined,
      description: input.description ?? undefined,
      imageUrl: input.imageUrl ?? undefined,
    });
    setPreview(null);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function onItineraryDragEnd(event: any) {
    if (event.canceled) return;
    const poiId = event.operation?.source?.id;
    if (poiId == null) return;
    const next = move(dayGroups, event) as Record<string, string[]>;
    if (next === dayGroups) return;
    for (const [key, ids] of Object.entries(next)) {
      const i = ids.indexOf(poiId);
      if (i !== -1) {
        movePoi.mutate({ poiId: String(poiId), dayId: key, orderInDay: i });
        return;
      }
    }
  }

  return (
    <APIProvider apiKey={apiKey}>
      <MapPickProvider>
      <div className="flex h-screen w-full">
        <div className="relative flex-1">
          {apiKey ? (
            <TripMap
              start={start}
              end={end}
              pois={poiPoints}
              onAddPlace={handleAddFromMap}
              legs={route?.legs ?? []}
              vias={trip.routeVias}
              onAddVia={(afterPoiId, lat, lng) => addVia.mutate({ afterPoiId, lat, lng })}
              onMoveVia={(viaId, lat, lng) => moveVia.mutate({ viaId, lat, lng })}
              onRemoveVia={(viaId) => removeVia.mutate(viaId)}
              nights={trip.days.filter((d) => d.night).map((d) => ({ dayId: d.id, lat: d.night!.lat, lng: d.night!.lng }))}
              onMoveNight={(dayId, lat, lng) => updateNight.mutate({ dayId, lat, lng })}
              dayChoices={trip.days.map((d) => ({
                id: d.id,
                label: formatDayDate(trip.startDate, d.dayIndex)
                  ? `Day ${d.dayIndex + 1} · ${formatDayDate(trip.startDate, d.dayIndex)}`
                  : `Day ${d.dayIndex + 1}`,
              }))}
              onSetNight={(dayId, lat, lng) => {
                const day = trip.days.find((d) => d.id === dayId);
                if (day?.night) updateNight.mutate({ dayId, lat, lng });
                else setNight.mutate({ dayId, lat, lng });
              }}
              preview={preview}
              onPreviewPlace={(placeId, position, source) =>
                setPreview({ placeId, position, source })
              }
              onPreviewClose={() => setPreview(null)}
              addedPlaceIds={addedPlaceIds}
            />
          ) : (
            <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
              Set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to enable the map and place search.
            </div>
          )}
        </div>

        <aside className="flex w-80 shrink-0 flex-col overflow-y-auto border-l p-4">
          <Link
            href="/"
            className="mb-2 inline-block text-xs text-muted-foreground hover:text-foreground"
          >
            ← Trips
          </Link>
          <input
            key={trip.title}
            defaultValue={trip.title}
            aria-label="Trip name"
            className="mb-1 w-full rounded bg-transparent text-lg font-semibold outline-none hover:bg-muted/40 focus:bg-muted/40"
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v && v !== trip.title) setTitle.mutate(v);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
          />
          {(() => {
            const finishMode: "open" | "round" | "place" =
              trip.endLat != null ? "place" : trip.isRoundTrip ? "round" : "open";
            const activeFinish = pendingMode ?? finishMode;
            return (
              <>
                <p className="mb-2 text-sm text-muted-foreground">
                  {trip.startName}
                  {activeFinish === "place"
                    ? ` → ${trip.endName ?? "destination…"}`
                    : activeFinish === "round"
                      ? " ↺ round trip"
                      : " → (open)"}
                </p>

                <div className="mb-3 space-y-2">
                  <div>
                    <div className="mb-1 text-xs text-muted-foreground">
                      Start: <span className="text-foreground">{trip.startName}</span>
                    </div>
                    <PlaceAutocomplete
                      placeholder="Change start…"
                      pickId="start"
                      onPick={(p) =>
                        updateBase.mutate({
                          start: { name: p.name, lat: p.lat, lng: p.lng, placeId: p.placeId },
                        })
                      }
                    />
                  </div>

                  <div>
                    <div className="mb-1 text-xs text-muted-foreground">Finish</div>
                    <div role="group" aria-label="Finish mode" className="flex gap-1">
                      <Button
                        size="sm"
                        variant={activeFinish === "open" ? "default" : "outline"}
                        aria-pressed={activeFinish === "open"}
                        className="h-7 px-2 text-xs"
                        onClick={() => {
                          setPendingMode("open");
                          updateBase.mutate({ finish: { mode: "open" } });
                        }}
                      >
                        Open
                      </Button>
                      <Button
                        size="sm"
                        variant={activeFinish === "round" ? "default" : "outline"}
                        aria-pressed={activeFinish === "round"}
                        className="h-7 px-2 text-xs"
                        onClick={() => {
                          setPendingMode("round");
                          updateBase.mutate({ finish: { mode: "round" } });
                        }}
                      >
                        Round trip
                      </Button>
                      <Button
                        size="sm"
                        variant={activeFinish === "place" ? "default" : "outline"}
                        aria-pressed={activeFinish === "place"}
                        className="h-7 px-2 text-xs"
                        onClick={() => setPendingMode("place")}
                      >
                        Place
                      </Button>
                    </div>
                    {activeFinish === "place" && !updateBase.isPending && (
                      <div className="mt-1">
                        {trip.endName ? (
                          <div className="mb-1 text-xs text-muted-foreground">
                            Ends at: <span className="text-foreground">{trip.endName}</span>
                          </div>
                        ) : null}
                        <PlaceAutocomplete
                          placeholder="Search destination…"
                          pickId="finish"
                          onPick={(p) =>
                            updateBase.mutate({
                              finish: {
                                mode: "place",
                                place: { name: p.name, lat: p.lat, lng: p.lng, placeId: p.placeId },
                              },
                            })
                          }
                        />
                      </div>
                    )}
                  </div>
                </div>
              </>
            );
          })()}
          {route && route.totalSeconds > 0 && (
            <p className="mb-4 text-xs text-muted-foreground">
              Total driving: {formatDuration(route.totalSeconds)} · {formatKm(route.totalMeters)}
            </p>
          )}
            <label className="mb-4 flex items-center gap-2 text-xs text-muted-foreground">
              <span>Start date</span>
              <input
                type="date"
                value={trip.startDate ? trip.startDate.slice(0, 10) : ""}
                onChange={(e) => setStartDate.mutate(e.target.value || null)}
                className="rounded border bg-background px-1 py-0.5 text-xs"
              />
            </label>

          <div className="mb-4">
            <PlaceAutocomplete
              placeholder="Search a place to add…"
              ariaLabel="Search a place to add"
              pickId="add"
              onPick={(p) => {
                if (p.placeId)
                  setPreview({
                    placeId: p.placeId,
                    position: { lat: p.lat, lng: p.lng },
                    source: "search",
                  });
              }}
            />
          </div>

          <div className="mb-3 flex gap-2">
            <Button
              size="sm"
              className="flex-1"
              disabled={unscheduledCount === 0 || buildSplit.isPending}
              onClick={() => buildSplit.mutate()}
            >
              {buildSplit.isPending ? "Splitting…" : "Build route & split into days"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={assignedCount === 0 || resplit.isPending}
              onClick={() => {
                if (
                  window.confirm(
                    "Re-split the whole trip? This rebuilds every day from scratch.",
                  )
                ) {
                  resplit.mutate();
                }
              }}
            >
              {resplit.isPending ? "Re-splitting…" : "Re-split all"}
            </Button>
          </div>

          <div className="mb-4">
            <div className="mb-2 text-sm font-medium">Places ({trip.pois.length})</div>
            <MasterList trip={trip} tripId={tripId} />
          </div>

          <DragDropProvider onDragEnd={onItineraryDragEnd}>
            <div className="space-y-3">
              {trip.days.map((day) => (
                <div key={day.id} className="rounded-md border p-3">
                  <div className="mb-2 flex items-center justify-between gap-2 text-sm font-medium">
                    <span>
                      Day {day.dayIndex + 1}
                      {formatDayDate(trip.startDate, day.dayIndex) ? (
                        <span className="ml-1 font-normal text-muted-foreground">
                          · {formatDayDate(trip.startDate, day.dayIndex)}
                        </span>
                      ) : null}
                    </span>
                    <span className="flex items-center gap-2">
                      {route?.perDaySeconds[day.id] ? (
                        <span className="text-xs font-normal text-muted-foreground">
                          🚗 {formatDuration(route.perDaySeconds[day.id])}
                          {route.perDayMeters?.[day.id]
                            ? ` · ${formatKm(route.perDayMeters[day.id])}`
                            : ""}
                        </span>
                      ) : null}
                      {byDay(day.id).length >= 3 ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-xs font-normal"
                          disabled={optimizeDay.isPending && optimizeDay.variables === day.id}
                          onClick={() => optimizeDay.mutate(day.id)}
                          aria-label={`Optimize order of day ${day.dayIndex + 1}`}
                        >
                          {optimizeDay.isPending && optimizeDay.variables === day.id ? "Optimizing…" : "Optimize"}
                        </Button>
                      ) : null}
                      <button
                        type="button"
                        aria-label={`Remove day ${day.dayIndex + 1}`}
                        className="px-1 text-xs text-muted-foreground hover:text-red-600"
                        onClick={() => {
                          if (window.confirm("Remove this day? Its places go back to the list and its night is discarded.")) {
                            removeDay.mutate(day.id);
                          }
                        }}
                      >
                        ✕
                      </button>
                    </span>
                  </div>
                  <PoiContainer id={day.id} pois={byDay(day.id)} tripId={tripId} emptyText="Assign places from the list above." />
                  <DayNight
                    tripId={tripId}
                    dayId={day.id}
                    night={day.night}
                  />
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                disabled={addDay.isPending}
                onClick={() => addDay.mutate()}
              >
                ＋ Add day
              </Button>
            </div>
          </DragDropProvider>
        </aside>
      </div>
      </MapPickProvider>
    </APIProvider>
  );
}
