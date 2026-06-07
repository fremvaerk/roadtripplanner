"use client";

import { TripMap, type MapPoint } from "@/components/trip-map";

type Day = { id: string; dayIndex: number; pois: { id: string; name: string }[] };

type TripView = {
  id: string;
  title: string;
  startName: string;
  startLat: number;
  startLng: number;
  endName: string | null;
  endLat: number | null;
  endLng: number | null;
  isRoundTrip: boolean;
  days: Day[];
  pois: { id: string; name: string; lat: number; lng: number }[];
};

export function PlannerShell({ trip }: { trip: TripView }) {
  const start: MapPoint = { lat: trip.startLat, lng: trip.startLng, name: trip.startName };
  const end: MapPoint | null =
    trip.endLat != null && trip.endLng != null
      ? { lat: trip.endLat, lng: trip.endLng, name: trip.endName ?? "End" }
      : null;
  const pois: MapPoint[] = trip.pois.map((p) => ({
    lat: p.lat,
    lng: p.lng,
    name: p.name,
    id: p.id,
  }));

  return (
    <div className="flex h-screen w-full">
      <div className="relative flex-1">
        <TripMap start={start} end={end} pois={pois} />
      </div>

      <aside className="w-80 shrink-0 overflow-y-auto border-l p-4">
        <h2 className="mb-1 text-lg font-semibold">{trip.title}</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          {trip.startName}
          {end ? ` → ${end.name}` : " (round trip)"}
        </p>

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
  );
}
