import type { TripDetail } from "@/lib/api/trips";
import type { RouteWaypoint } from "@/lib/routing/routes";

export function attributeLegDurations(
  legDayId: (string | null)[],
  legSeconds: number[],
  legMeters: number[] = [],
): {
  perDaySeconds: Record<string, number>;
  perDayMeters: Record<string, number>;
  totalSeconds: number;
  totalMeters: number;
} {
  const perDaySeconds: Record<string, number> = {};
  const perDayMeters: Record<string, number> = {};
  let totalSeconds = 0;
  let totalMeters = 0;
  for (let i = 0; i < legSeconds.length; i++) {
    const secs = legSeconds[i] ?? 0;
    const meters = legMeters[i] ?? 0;
    totalSeconds += secs;
    totalMeters += meters;
    const day = legDayId[i];
    if (day) {
      perDaySeconds[day] = (perDaySeconds[day] ?? 0) + secs;
      perDayMeters[day] = (perDayMeters[day] ?? 0) + meters;
    }
  }
  return { perDaySeconds, perDayMeters, totalSeconds, totalMeters };
}

export type TripVia = { id: string; dayId: string | null; afterPoiId: string | null; lat: number; lng: number; seq: number };

export type DayRouteSegment = {
  waypoints: RouteWaypoint[];
  legDayId: (string | null)[];
  legAfterPoiId: (string | null)[];
};

type SegNode = {
  wp: RouteWaypoint;
  dayId: string | null;
  poiId: string | null;
  isNight: boolean;
  trailingVias: RouteWaypoint[];
};

function buildSegment(nodes: SegNode[], a: number, b: number, trailingDayId: string | null): DayRouteSegment {
  const waypoints: RouteWaypoint[] = [];
  for (let i = a; i <= b; i++) {
    waypoints.push(nodes[i].wp);
    if (i < b) for (const v of nodes[i].trailingVias) waypoints.push(v);
  }
  const legDayId: (string | null)[] = [];
  const legAfterPoiId: (string | null)[] = [];
  for (let i = a; i < b; i++) {
    legDayId.push(nodes[i + 1].dayId ?? trailingDayId);
    legAfterPoiId.push(nodes[i].poiId);
  }
  return { waypoints, legDayId, legAfterPoiId };
}

/** Split the ordered stop chain into one route request per day, cutting at each
 *  night (the night is the last stopover of its segment and the first of the next). */
export function buildDayRouteRequests(trip: TripDetail, vias: TripVia[]): DayRouteSegment[] {
  const daysOrdered = [...trip.days].sort((x, y) => x.dayIndex - y.dayIndex);
  const stopsByDay = new Map<string, typeof trip.pois>();
  for (const day of daysOrdered) {
    stopsByDay.set(
      day.id,
      trip.pois.filter((p) => p.dayId === day.id).sort((p, q) => (p.orderInDay ?? 0) - (q.orderInDay ?? 0)),
    );
  }

  const start: RouteWaypoint = { lat: trip.startLat, lng: trip.startLng };
  const terminator: RouteWaypoint | null =
    trip.endLat != null && trip.endLng != null
      ? { lat: trip.endLat, lng: trip.endLng }
      : trip.isRoundTrip
        ? { lat: trip.startLat, lng: trip.startLng }
        : null;

  const scheduled = new Set(trip.pois.filter((p) => p.dayId !== null).map((p) => p.id));
  // Vias anchored after a real (scheduled) stop — keyed by that poi id.
  const byPoi = new Map<string, TripVia[]>();
  // "Entry" vias (afterPoiId === null): they sit at the START of a day's leg,
  // right after the night/start that begins the day — keyed by the via's dayId.
  const byDayEntry = new Map<string, TripVia[]>();
  // Legacy vias from before vias had a dayId (null afterPoiId AND null dayId):
  // preserve the old behaviour — attach to the trip start (day 1's entry).
  const legacyEntry: TripVia[] = [];
  for (const v of vias) {
    if (v.afterPoiId !== null) {
      if (!scheduled.has(v.afterPoiId)) continue;
      const list = byPoi.get(v.afterPoiId) ?? [];
      list.push(v);
      byPoi.set(v.afterPoiId, list);
    } else if (v.dayId !== null) {
      const list = byDayEntry.get(v.dayId) ?? [];
      list.push(v);
      byDayEntry.set(v.dayId, list);
    } else {
      legacyEntry.push(v);
    }
  }
  const toWps = (list: TripVia[] | undefined): RouteWaypoint[] =>
    (list ?? []).slice().sort((p, q) => p.seq - q.seq).map((v) => ({ lat: v.lat, lng: v.lng, via: true }));
  const poiViaWps = (poiId: string): RouteWaypoint[] => toWps(byPoi.get(poiId));
  const entryViaWps = (dayId: string): RouteWaypoint[] => toWps(byDayEntry.get(dayId));

  const nodes: SegNode[] = [];
  // Start node carries the legacy day-1 entry vias; the loop appends day 1's own.
  nodes.push({ wp: start, dayId: null, poiId: null, isNight: false, trailingVias: toWps(legacyEntry) });
  let prevBoundary = 0; // node that precedes the current day's first stop
  for (const day of daysOrdered) {
    const stops = stopsByDay.get(day.id) ?? [];
    // This day's entry vias attach to the node just before its first stop.
    nodes[prevBoundary].trailingVias.push(...entryViaWps(day.id));
    for (const s of stops) {
      nodes.push({ wp: { lat: s.lat, lng: s.lng }, dayId: day.id, poiId: s.id, isNight: false, trailingVias: poiViaWps(s.id) });
    }
    if (day.night) {
      nodes.push({ wp: { lat: day.night.lat, lng: day.night.lng }, dayId: day.id, poiId: null, isNight: true, trailingVias: [] });
      prevBoundary = nodes.length - 1; // the night begins the next day's leg
    } else if (stops.length) {
      prevBoundary = nodes.length - 1; // no night: next day's entry follows this last stop
    }
  }
  if (terminator) nodes.push({ wp: terminator, dayId: null, poiId: null, isNight: false, trailingVias: [] });

  const lastContent = [...nodes].reverse().find((n) => n.dayId !== null);
  let trailingDayId = lastContent?.dayId ?? null;
  if (lastContent && lastContent.isNight && lastContent.dayId !== null) {
    const idx = daysOrdered.findIndex((d) => d.id === lastContent.dayId);
    if (idx >= 0 && idx + 1 < daysOrdered.length) trailingDayId = daysOrdered[idx + 1].id;
  }

  const segments: DayRouteSegment[] = [];
  // Cut a segment at each night (the night is shared as the next segment's first
  // stopover) and at the final node. `if (i > segStart)` drops a zero-width segment
  // (e.g. an open trip with only a start → no segments at all). The `segStart = i`
  // advance only matters for the night branch; on the final node the loop then ends.
  let segStart = 0;
  for (let i = 0; i < nodes.length; i++) {
    const isLast = i === nodes.length - 1;
    if (nodes[i].isNight || isLast) {
      if (i > segStart) segments.push(buildSegment(nodes, segStart, i, trailingDayId));
      segStart = i;
    }
  }
  return segments;
}
