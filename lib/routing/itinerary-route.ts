import type { TripDetail } from "@/lib/api/trips";
import type { LatLngLiteral } from "@/lib/routing/routes";

export type OrderedRoute = {
  coords: LatLngLiteral[];
  /** For each leg (coords[i] -> coords[i+1]), the day it's attributed to (or null). */
  legDayId: (string | null)[];
};

/** start -> assigned stops in (dayIndex, orderInDay) order -> end (or back to start). */
export function orderedRoutePoints(trip: TripDetail): OrderedRoute {
  const dayIndexById = new Map(trip.days.map((d) => [d.id, d.dayIndex]));
  const assigned = trip.pois
    .filter((p) => p.dayId !== null)
    .sort((a, b) => {
      const da = dayIndexById.get(a.dayId as string) ?? 0;
      const db = dayIndexById.get(b.dayId as string) ?? 0;
      if (da !== db) return da - db;
      return (a.orderInDay ?? 0) - (b.orderInDay ?? 0);
    });

  const start: LatLngLiteral = { lat: trip.startLat, lng: trip.startLng };
  const end: LatLngLiteral =
    trip.endLat != null && trip.endLng != null
      ? { lat: trip.endLat, lng: trip.endLng }
      : start;

  const coords: LatLngLiteral[] = [start, ...assigned.map((p) => ({ lat: p.lat, lng: p.lng })), end];
  const stopDayIds = assigned.map((p) => p.dayId as string);

  const legDayId: (string | null)[] = [];
  for (let i = 0; i < coords.length - 1; i++) {
    if (i < stopDayIds.length) {
      legDayId.push(stopDayIds[i]);
    } else {
      legDayId.push(stopDayIds.length ? stopDayIds[stopDayIds.length - 1] : null);
    }
  }

  return { coords, legDayId };
}

export function attributeLegDurations(
  legDayId: (string | null)[],
  legSeconds: number[],
): { perDaySeconds: Record<string, number>; totalSeconds: number } {
  const perDaySeconds: Record<string, number> = {};
  let totalSeconds = 0;
  for (let i = 0; i < legSeconds.length; i++) {
    const secs = legSeconds[i] ?? 0;
    totalSeconds += secs;
    const day = legDayId[i];
    if (day) perDaySeconds[day] = (perDaySeconds[day] ?? 0) + secs;
  }
  return { perDaySeconds, totalSeconds };
}
