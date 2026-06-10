import type { TripDetail } from "@/lib/api/trips";
import type { LatLngLiteral, RouteWaypoint } from "@/lib/routing/routes";

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
  const terminator: LatLngLiteral | null =
    trip.endLat != null && trip.endLng != null
      ? { lat: trip.endLat, lng: trip.endLng } // specific place
      : trip.isRoundTrip
        ? start // round trip
        : null; // open — end at the last stop

  const coords: LatLngLiteral[] = [
    start,
    ...assigned.map((p) => ({ lat: p.lat, lng: p.lng })),
    ...(terminator ? [terminator] : []),
  ];
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

export type TripVia = { id: string; afterPoiId: string | null; lat: number; lng: number; seq: number };

export type BuiltRoute = {
  waypoints: RouteWaypoint[];
  legDayId: (string | null)[];
  legAfterPoiId: (string | null)[];
};

/** Build the route waypoint list (vias as via:true after their anchor stop) plus,
 *  per stop-to-stop leg, the day (arrival) and the anchor stop id (leg start). */
export function buildRoute(trip: TripDetail, vias: TripVia[]): BuiltRoute {
  const daysOrdered = [...trip.days].sort((a, b) => a.dayIndex - b.dayIndex);
  const stopsByDay = new Map<string, typeof trip.pois>();
  for (const day of daysOrdered) {
    stopsByDay.set(
      day.id,
      trip.pois
        .filter((p) => p.dayId === day.id)
        .sort((a, b) => (a.orderInDay ?? 0) - (b.orderInDay ?? 0)),
    );
  }

  const start: RouteWaypoint = { lat: trip.startLat, lng: trip.startLng };
  const terminator: RouteWaypoint | null =
    trip.endLat != null && trip.endLng != null
      ? { lat: trip.endLat, lng: trip.endLng } // specific place
      : trip.isRoundTrip
        ? { lat: trip.startLat, lng: trip.startLng } // round trip
        : null; // open

  const scheduled = new Set(trip.pois.filter((p) => p.dayId !== null).map((p) => p.id));
  const byAnchor = new Map<string | null, TripVia[]>();
  for (const v of vias) {
    if (v.afterPoiId !== null && !scheduled.has(v.afterPoiId)) continue;
    const list = byAnchor.get(v.afterPoiId) ?? [];
    list.push(v);
    byAnchor.set(v.afterPoiId, list);
  }
  for (const list of byAnchor.values()) list.sort((a, b) => a.seq - b.seq);

  type Stopover = { wp: RouteWaypoint; dayId: string | null; poiId: string | null };
  const stopovers: Stopover[] = [{ wp: start, dayId: null, poiId: null }];
  const waypoints: RouteWaypoint[] = [start];

  for (const v of byAnchor.get(null) ?? []) waypoints.push({ lat: v.lat, lng: v.lng, via: true });

  for (const day of daysOrdered) {
    for (const s of stopsByDay.get(day.id) ?? []) {
      stopovers.push({ wp: { lat: s.lat, lng: s.lng }, dayId: day.id, poiId: s.id });
      waypoints.push({ lat: s.lat, lng: s.lng });
      for (const v of byAnchor.get(s.id) ?? []) waypoints.push({ lat: v.lat, lng: v.lng, via: true });
    }
    if (day.night) {
      stopovers.push({ wp: { lat: day.night.lat, lng: day.night.lng }, dayId: day.id, poiId: null });
      waypoints.push({ lat: day.night.lat, lng: day.night.lng });
    }
  }

  if (terminator) {
    stopovers.push({ wp: terminator, dayId: null, poiId: null });
    waypoints.push(terminator);
  }

  // The only legs that arrive at a day-less stopover are the trailing drive(s)
  // to the destination (and the return leg on a round trip). A night *ends* its
  // day, so the drive after the final night belongs to the NEXT day, not the
  // night's own day. A stop does not end a day, so a trailing drive after a stop
  // stays on that stop's day.
  const lastContent = [...stopovers].reverse().find((s) => s.dayId !== null);
  let trailingDayId = lastContent?.dayId ?? null;
  if (lastContent && lastContent.poiId === null && lastContent.dayId !== null) {
    const idx = daysOrdered.findIndex((d) => d.id === lastContent.dayId);
    if (idx >= 0 && idx + 1 < daysOrdered.length) {
      trailingDayId = daysOrdered[idx + 1].id;
    }
  }

  const legDayId: (string | null)[] = [];
  const legAfterPoiId: (string | null)[] = [];
  for (let i = 0; i < stopovers.length - 1; i++) {
    const arrival = stopovers[i + 1];
    legDayId.push(arrival.dayId ?? trailingDayId);
    legAfterPoiId.push(stopovers[i].poiId);
  }

  return { waypoints, legDayId, legAfterPoiId };
}

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
  const byAnchor = new Map<string | null, TripVia[]>();
  for (const v of vias) {
    if (v.afterPoiId !== null && !scheduled.has(v.afterPoiId)) continue;
    const list = byAnchor.get(v.afterPoiId) ?? [];
    list.push(v);
    byAnchor.set(v.afterPoiId, list);
  }
  for (const list of byAnchor.values()) list.sort((p, q) => p.seq - q.seq);
  const viaWps = (anchor: string | null): RouteWaypoint[] =>
    (byAnchor.get(anchor) ?? []).map((v) => ({ lat: v.lat, lng: v.lng, via: true }));

  const nodes: SegNode[] = [];
  nodes.push({ wp: start, dayId: null, poiId: null, isNight: false, trailingVias: viaWps(null) });
  for (const day of daysOrdered) {
    for (const s of stopsByDay.get(day.id) ?? []) {
      nodes.push({ wp: { lat: s.lat, lng: s.lng }, dayId: day.id, poiId: s.id, isNight: false, trailingVias: viaWps(s.id) });
    }
    if (day.night) {
      nodes.push({ wp: { lat: day.night.lat, lng: day.night.lng }, dayId: day.id, poiId: null, isNight: true, trailingVias: [] });
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
