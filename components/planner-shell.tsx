"use client";

import { APIProvider } from "@vis.gl/react-google-maps";
import { DragDropProvider } from "@dnd-kit/react";
import { move } from "@dnd-kit/helpers";
import { TripMap, type MapPoint } from "@/components/trip-map";
import { PlaceSearch } from "@/components/place-search";
import { PoiContainer } from "@/components/poi-container";
import { Button } from "@/components/ui/button";
import { useTrip } from "@/hooks/use-trip";
import { useRoute } from "@/hooks/use-route";
import { useAddPoi, useMovePoi, useOptimizeDay, useBuildSplit, useResplit } from "@/hooks/use-poi-mutations";
import type { AddPoiInput } from "@/lib/itinerary/operations";

function formatDuration(seconds: number): string {
  if (!seconds) return "0 min";
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (h && m) return `${h} h ${m} min`;
  if (h) return `${h} h`;
  return `${m} min`;
}

export function PlannerShell({ tripId }: { tripId: string }) {
  const { data: trip, isLoading, isError } = useTrip(tripId);
  const { data: route } = useRoute(tripId);
  const addPoi = useAddPoi(tripId);
  const movePoi = useMovePoi(tripId);
  const optimizeDay = useOptimizeDay(tripId);
  const buildSplit = useBuildSplit(tripId);
  const resplit = useResplit(tripId);

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
  const poiPoints: MapPoint[] = trip.pois.map((p) => ({
    lat: p.lat,
    lng: p.lng,
    name: p.name,
    id: p.id,
  }));

  const byDay = (dayId: string | null) =>
    trip.pois
      .filter((p) => p.dayId === dayId)
      .sort((a, b) => (a.orderInDay ?? 0) - (b.orderInDay ?? 0));
  const pool = byDay(null);
  const assignedCount = trip.pois.filter((p) => p.dayId !== null).length;

  const groups: Record<string, string[]> = { pool: pool.map((p) => p.id) };
  for (const day of trip.days) groups[day.id] = byDay(day.id).map((p) => p.id);

  function handleAddFromMap(input: AddPoiInput) {
    addPoi.mutate({
      name: input.name,
      lat: input.lat,
      lng: input.lng,
      placeId: input.placeId ?? undefined,
      category: input.category ?? undefined,
      source: "map",
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function onDragEnd(event: any) {
    if (event.canceled) return;
    const poiId = event.operation?.source?.id;
    if (poiId == null) return;
    const next = move(groups, event) as Record<string, string[]>;
    if (next === groups) return; // dnd-kit returns the same reference on a no-op drop
    let destKey: string | undefined;
    let destIndex = 0;
    for (const [key, ids] of Object.entries(next)) {
      const i = ids.indexOf(poiId);
      if (i !== -1) {
        destKey = key;
        destIndex = i;
        break;
      }
    }
    if (!destKey) return;
    movePoi.mutate({
      poiId: String(poiId),
      dayId: destKey === "pool" ? null : destKey,
      orderInDay: destIndex,
    });
  }

  return (
    <APIProvider apiKey={apiKey}>
      <DragDropProvider onDragEnd={onDragEnd}>
        <div className="flex h-screen w-full">
          <div className="relative flex-1">
            {apiKey ? (
              <TripMap start={start} end={end} pois={poiPoints} onAddPlace={handleAddFromMap} routePolyline={route?.encodedPolyline ?? null} />
            ) : (
              <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
                Set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to enable the map and place search.
              </div>
            )}
          </div>

          <aside className="flex w-80 shrink-0 flex-col overflow-y-auto border-l p-4">
            <h2 className="mb-1 text-lg font-semibold">{trip.title}</h2>
            <p className="mb-1 text-sm text-muted-foreground">
              {trip.startName}
              {end ? ` → ${end.name}` : " (round trip)"}
            </p>
            {route && route.totalSeconds > 0 && (
              <p className="mb-4 text-xs text-muted-foreground">
                Total driving: {formatDuration(route.totalSeconds)} ·{" "}
                {Math.round(route.totalMeters / 1000)} km
              </p>
            )}

            <div className="mb-4">
              <PlaceSearch tripId={tripId} />
            </div>

            <div className="mb-3 flex gap-2">
              <Button
                size="sm"
                className="flex-1"
                disabled={pool.length === 0 || buildSplit.isPending}
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
                      "Re-split the whole trip? This rebuilds every day from scratch and clears your overnight marks.",
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
              <div className="mb-2 text-sm font-medium">Unassigned places ({pool.length})</div>
              <PoiContainer
                id="pool"
                pois={pool}
                tripId={tripId}
                emptyText="Search above or click a place on the map to add it."
              />
            </div>

            <div className="space-y-3">
              {trip.days.map((day) => (
                <div key={day.id} className="rounded-md border p-3">
                  <div className="mb-2 flex items-center justify-between gap-2 text-sm font-medium">
                    <span>Day {day.dayIndex + 1}</span>
                    <span className="flex items-center gap-2">
                      {route?.perDaySeconds[day.id] ? (
                        <span className="text-xs font-normal text-muted-foreground">
                          🚗 {formatDuration(route.perDaySeconds[day.id])}
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
                          {optimizeDay.isPending && optimizeDay.variables === day.id
                            ? "Optimizing…"
                            : "Optimize"}
                        </Button>
                      ) : null}
                    </span>
                  </div>
                  <PoiContainer
                    id={day.id}
                    pois={byDay(day.id)}
                    tripId={tripId}
                    emptyText="Drag places here."
                  />
                </div>
              ))}
            </div>
          </aside>
        </div>
      </DragDropProvider>
    </APIProvider>
  );
}
