import type { TripDetail, PoiDetail } from "@/lib/api/trips";

/**
 * Pure, optimistic mirror of the server `movePoi`: returns a new TripDetail with
 * `poiId` moved to `dayId` (null = pool) at `index`, re-indexing affected days.
 */
export function applyMove(
  trip: TripDetail,
  poiId: string,
  dayId: string | null,
  index: number,
): TripDetail {
  const moving = trip.pois.find((p) => p.id === poiId);
  if (!moving) return trip;
  const oldDayId = moving.dayId;

  const destOrder = new Map<string, number>();
  if (dayId !== null) {
    const ids = trip.pois
      .filter((p) => p.dayId === dayId && p.id !== poiId)
      .sort((a, b) => (a.orderInDay ?? 0) - (b.orderInDay ?? 0))
      .map((p) => p.id);
    const clamped = Math.max(0, Math.min(index, ids.length));
    ids.splice(clamped, 0, poiId);
    ids.forEach((id, i) => destOrder.set(id, i));
  }

  const srcOrder = new Map<string, number>();
  if (oldDayId && oldDayId !== dayId) {
    trip.pois
      .filter((p) => p.dayId === oldDayId && p.id !== poiId)
      .sort((a, b) => (a.orderInDay ?? 0) - (b.orderInDay ?? 0))
      .forEach((p, i) => srcOrder.set(p.id, i));
  }

  const pois: PoiDetail[] = trip.pois.map((p) => {
    if (p.id === poiId) {
      if (dayId === null) {
        return { ...p, dayId: null, orderInDay: null, isOvernight: false };
      }
      // Moving to a different day drops the overnight flag; same-day reorder keeps it.
      return oldDayId !== dayId
        ? { ...p, dayId, orderInDay: destOrder.get(p.id) ?? 0, isOvernight: false }
        : { ...p, dayId, orderInDay: destOrder.get(p.id) ?? 0 };
    }
    if (destOrder.has(p.id)) return { ...p, orderInDay: destOrder.get(p.id)! };
    if (srcOrder.has(p.id)) return { ...p, orderInDay: srcOrder.get(p.id)! };
    return p;
  });

  return { ...trip, pois };
}
