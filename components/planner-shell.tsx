"use client";

import { APIProvider } from "@vis.gl/react-google-maps";
import { TripMap, type MapPoint } from "@/components/trip-map";
import { PlaceSearch } from "@/components/place-search";
import { useTrip } from "@/hooks/use-trip";
import { useAddPoi, useRemovePoi } from "@/hooks/use-poi-mutations";
import { Button } from "@/components/ui/button";
import type { AddPoiInput } from "@/lib/itinerary/operations";

export function PlannerShell({ tripId }: { tripId: string }) {
  const { data: trip, isLoading, isError } = useTrip(tripId);
  const addPoi = useAddPoi(tripId);
  const removePoi = useRemovePoi(tripId);

  if (isLoading) {
    return <div className="flex h-screen items-center justify-center text-sm text-muted-foreground">Loading trip…</div>;
  }
  if (isError || !trip) {
    return <div className="flex h-screen items-center justify-center text-sm text-red-600">Couldn’t load this trip.</div>;
  }

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
  const pool = trip.pois.filter((p) => p.dayId === null);
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

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

  return (
    <APIProvider apiKey={apiKey}>
      <div className="flex h-screen w-full">
        <div className="relative flex-1">
          {apiKey ? (
            <TripMap start={start} end={end} pois={poiPoints} onAddPlace={handleAddFromMap} />
          ) : (
            <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
              Set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to enable the map and place search.
            </div>
          )}
        </div>

      <aside className="flex w-80 shrink-0 flex-col overflow-y-auto border-l p-4">
        <h2 className="mb-1 text-lg font-semibold">{trip.title}</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          {trip.startName}
          {end ? ` → ${end.name}` : " (round trip)"}
        </p>

        <div className="mb-4">
          <PlaceSearch tripId={tripId} />
        </div>

        <div className="mb-4">
          <div className="mb-2 text-sm font-medium">
            Unassigned places ({pool.length})
          </div>
          {pool.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Search above or click a place on the map to add it.
            </p>
          ) : (
            <ul className="space-y-1">
              {pool.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                >
                  <span className="truncate">{p.name}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removePoi.mutate(p.id)}
                    aria-label={`Remove ${p.name}`}
                  >
                    ✕
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-3">
          {trip.days.map((day) => (
            <div key={day.id} className="rounded-md border p-3">
              <div className="mb-2 text-sm font-medium">Day {day.dayIndex + 1}</div>
              {day.pois.length === 0 ? (
                <p className="text-xs text-muted-foreground">No stops yet.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {day.pois.map((p) => (
                    <li key={p.id}>{p.name}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </aside>
      </div>
    </APIProvider>
  );
}
