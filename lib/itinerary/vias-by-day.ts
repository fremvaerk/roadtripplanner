import type { TripVia } from "@/lib/api/trips";

type MinimalTrip = {
  days: { id: string; dayIndex: number }[];
  pois: { id: string; dayId: string | null }[];
  routeVias: TripVia[];
};

/**
 * Group a trip's route vias (control points) by the day they belong to, for the
 * day-list view. Mirrors the route builder's attribution:
 *  - a poi-anchored via follows its anchor poi's day (skipped if that poi is
 *    unscheduled — it isn't on the route);
 *  - an entry via (afterPoiId null) uses its own dayId;
 *  - a legacy null/null via falls to the first day (the trip-start entry).
 * Each day's list is ordered by seq.
 */
export function viasByDay(trip: MinimalTrip): Map<string, TripVia[]> {
  const poiDay = new Map(trip.pois.map((p) => [p.id, p.dayId] as const));
  const firstDayId = [...trip.days].sort((a, b) => a.dayIndex - b.dayIndex)[0]?.id ?? null;
  const out = new Map<string, TripVia[]>();
  for (const v of trip.routeVias) {
    let dayId: string | null;
    if (v.afterPoiId !== null) {
      const d = poiDay.get(v.afterPoiId);
      if (!d) continue; // anchor poi unscheduled → not drawn on the route
      dayId = d;
    } else {
      dayId = v.dayId ?? firstDayId;
    }
    if (!dayId) continue;
    const list = out.get(dayId) ?? [];
    list.push(v);
    out.set(dayId, list);
  }
  for (const list of out.values()) list.sort((a, b) => a.seq - b.seq);
  return out;
}
