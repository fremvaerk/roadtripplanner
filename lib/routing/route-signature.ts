import type { TripDetail } from "@/lib/api/trips";
import { buildDayRouteRequests } from "@/lib/routing/itinerary-route";

/**
 * A stable string of the exact inputs that determine the computed route — the
 * per-day waypoint sequences (start, stops, nights, vias, finish). If this is
 * unchanged, the route cannot change.
 *
 * `useRoute` uses it to refetch the (paid) Google Routes API only when these
 * inputs actually differ — whether the change came from a local edit or from
 * another user's edit surfaced by `useTrip`'s polling — instead of on a timer.
 */
export function routeSignature(trip: TripDetail): string {
  return JSON.stringify(buildDayRouteRequests(trip, trip.routeVias ?? []));
}
