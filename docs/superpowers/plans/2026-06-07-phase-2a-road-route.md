# Phase 2a — Real Road Route + Drive Time Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the straight placeholder line with the real driving route (Google Routes API) through the trip's assigned stops, and show per-day and total drive time + distance.

**Architecture:** A server-side `computeRoute` helper calls the Routes API (`directions/v2:computeRoutes`) so the key stays private; a pure `itinerary-route` module turns the trip into an ordered point list and attributes each driving leg to a day. A `GET /api/trips/[tripId]/route` endpoint returns the encoded polyline plus per-day/total durations, fetched client-side via a `useRoute` query and rendered on the map (decoded with the Maps geometry library).

**Tech Stack:** Next.js 16 + React 19, Prisma 7, TanStack Query v5, Google **Routes API** (REST `computeRoutes`), `@vis.gl/react-google-maps` (geometry library for polyline decode), Zod 4, Bun test runner.

---

## Context for the implementer (state after Phase 1b)

- The planner is client-driven via TanStack Query. `hooks/use-trip.ts` exports `tripQueryKey(tripId)`, `useTrip(tripId)`. `lib/api/trips.ts` exports `TripDetail`, `DayDetail`, `PoiDetail` and fetchers. `TripDetail` has `startLat/startLng/startName`, `endLat/endLng/endName` (end nullable → round trip), `isRoundTrip`, `days: DayDetail[]`, and a flat `pois: PoiDetail[]` (each with `dayId`, `orderInDay`; `dayId=null` = pool).
- `components/trip-map.tsx` (client) renders pins and currently draws a **straight** `google.maps.Polyline` through `[start, ...pois, ...end]` via an internal `RoutePolyline`. It already uses `@vis.gl/react-google-maps` (`Map`, `AdvancedMarker`, `useMap`, `useMapsLibrary`) and is wrapped by an `<APIProvider>` in `planner-shell.tsx`.
- `components/planner-shell.tsx` renders the map + sidebar (pool + per-day `PoiContainer`s) inside `<APIProvider>` and `<DragDropProvider>`.
- Env: `GOOGLE_MAPS_SERVER_KEY` (server, must have **Routes API** enabled in Google Cloud) and `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` (browser, Maps JS) are set in `.env`. `lib/geocode.ts` shows the existing pattern of a server helper taking an `apiKey` arg defaulting to `process.env.GOOGLE_MAPS_SERVER_KEY`, with a typed error class and mocked-fetch tests.
- Tests run via `bun run test`. Git identity configured; NO AI co-author trailer.

**Scope note:** within-day waypoint optimization and the day-split engine are **Phase 2b** (they need overnight anchors to be meaningful). 2a only computes/draws the route for the *current* ordered assignment and shows drive times. Pool (unassigned) POIs are NOT part of the route line.

---

## File Structure

```
lib/routing/routes.ts                    (CREATE) computeRoute — Routes API call (server), mockable
lib/routing/itinerary-route.ts           (CREATE) pure: orderedRoutePoints + attributeLegDurations
app/api/trips/[tripId]/route/route.ts    (CREATE) GET: road polyline + per-day/total durations
lib/api/trips.ts                         (MODIFY) add RouteResult type + fetchRoute
hooks/use-route.ts                       (CREATE) useRoute(tripId) query
components/trip-map.tsx                   (MODIFY) render decoded road polyline when provided
components/planner-shell.tsx              (MODIFY) useRoute → pass polyline to map + show drive times
tests/routing/routes.test.ts             (CREATE)
tests/routing/itinerary-route.test.ts    (CREATE)
```

Boundaries:
- `lib/routing/routes.ts` — only talks to the Routes API; returns plain numbers + the encoded polyline. No trip/DB knowledge.
- `lib/routing/itinerary-route.ts` — pure trip→points transformation and leg→day attribution. No I/O.
- API route — orchestrates: load trip → build points → computeRoute → attribute → respond.
- Components — presentation; data via `useRoute`.

---

## Task 1: `computeRoute` Routes API helper — TDD

**Files:** create `lib/routing/routes.ts`; test `tests/routing/routes.test.ts`.

- [ ] **Step 1: Write the failing test** `tests/routing/routes.test.ts`:

```ts
import { test, expect, describe, afterEach } from "bun:test";
import { computeRoute, RouteError } from "@/lib/routing/routes";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function mockFetch(payload: unknown, ok = true, status = 200) {
  globalThis.fetch = (async () =>
    ({ ok, status, json: async () => payload }) as Response) as typeof fetch;
}

const sample = {
  routes: [
    {
      duration: "3600s",
      distanceMeters: 100000,
      polyline: { encodedPolyline: "abc123" },
      legs: [
        { duration: "1800s", distanceMeters: 40000 },
        { duration: "1800s", distanceMeters: 60000 },
      ],
    },
  ],
};

describe("computeRoute", () => {
  test("returns polyline, legs, and totals on success", async () => {
    mockFetch(sample);
    const r = await computeRoute(
      [
        { lat: 1, lng: 1 },
        { lat: 2, lng: 2 },
        { lat: 3, lng: 3 },
      ],
      "fake-key",
    );
    expect(r.encodedPolyline).toBe("abc123");
    expect(r.totalDurationSeconds).toBe(3600);
    expect(r.totalDistanceMeters).toBe(100000);
    expect(r.legs.map((l) => l.durationSeconds)).toEqual([1800, 1800]);
    expect(r.legs.map((l) => l.distanceMeters)).toEqual([40000, 60000]);
  });

  test("throws RouteError when fewer than 2 points", async () => {
    await expect(computeRoute([{ lat: 1, lng: 1 }], "fake-key")).rejects.toBeInstanceOf(RouteError);
  });

  test("throws RouteError on HTTP failure", async () => {
    mockFetch({}, false, 500);
    await expect(
      computeRoute([{ lat: 1, lng: 1 }, { lat: 2, lng: 2 }], "fake-key"),
    ).rejects.toBeInstanceOf(RouteError);
  });

  test("throws RouteError when no route is returned", async () => {
    mockFetch({ routes: [] });
    await expect(
      computeRoute([{ lat: 1, lng: 1 }, { lat: 2, lng: 2 }], "fake-key"),
    ).rejects.toBeInstanceOf(RouteError);
  });

  test("throws RouteError when the API key is missing", async () => {
    await expect(
      computeRoute([{ lat: 1, lng: 1 }, { lat: 2, lng: 2 }], ""),
    ).rejects.toBeInstanceOf(RouteError);
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `bun test tests/routing/routes.test.ts`
Expected: FAIL — cannot resolve `@/lib/routing/routes`.

- [ ] **Step 3: Implement `lib/routing/routes.ts`**

```ts
const ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";

export class RouteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RouteError";
  }
}

export type LatLngLiteral = { lat: number; lng: number };
export type RouteLeg = { durationSeconds: number; distanceMeters: number };
export type ComputedRoute = {
  encodedPolyline: string;
  legs: RouteLeg[];
  totalDurationSeconds: number;
  totalDistanceMeters: number;
};

function toWaypoint(p: LatLngLiteral) {
  return { location: { latLng: { latitude: p.lat, longitude: p.lng } } };
}

function parseSeconds(d: string | undefined): number {
  if (!d) return 0;
  return parseInt(d.replace(/s$/, ""), 10) || 0;
}

export async function computeRoute(
  points: LatLngLiteral[],
  apiKey: string | undefined = process.env.GOOGLE_MAPS_SERVER_KEY,
): Promise<ComputedRoute> {
  if (!apiKey) throw new RouteError("Missing GOOGLE_MAPS_SERVER_KEY");
  if (points.length < 2) throw new RouteError("A route needs at least two points");

  const [origin, ...rest] = points;
  const destination = rest[rest.length - 1];
  const intermediates = rest.slice(0, -1);

  const res = await fetch(ROUTES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask":
        "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.legs.duration,routes.legs.distanceMeters",
    },
    body: JSON.stringify({
      origin: toWaypoint(origin),
      destination: toWaypoint(destination),
      intermediates: intermediates.map(toWaypoint),
      travelMode: "DRIVE",
      units: "METRIC",
    }),
  });

  if (!res.ok) throw new RouteError(`Routes request failed (HTTP ${res.status})`);

  const data = (await res.json()) as {
    routes?: Array<{
      duration?: string;
      distanceMeters?: number;
      polyline?: { encodedPolyline?: string };
      legs?: Array<{ duration?: string; distanceMeters?: number }>;
    }>;
  };

  const route = data.routes?.[0];
  if (!route || !route.polyline?.encodedPolyline) {
    throw new RouteError("No route returned");
  }

  return {
    encodedPolyline: route.polyline.encodedPolyline,
    legs: (route.legs ?? []).map((l) => ({
      durationSeconds: parseSeconds(l.duration),
      distanceMeters: l.distanceMeters ?? 0,
    })),
    totalDurationSeconds: parseSeconds(route.duration),
    totalDistanceMeters: route.distanceMeters ?? 0,
  };
}
```

- [ ] **Step 4: Run and confirm pass**

Run: `bun test tests/routing/routes.test.ts`
Expected: PASS (5 cases).

- [ ] **Step 5: Commit**

```bash
git add lib/routing/routes.ts tests/routing/routes.test.ts
git commit -m "feat: add Routes API computeRoute helper with tests"
```

---

## Task 2: Pure itinerary→route transform — TDD

**Files:** create `lib/routing/itinerary-route.ts`; test `tests/routing/itinerary-route.test.ts`.

> Builds the ordered driving point list (`start` → assigned stops in day/order → `end` or back to `start` for a round trip) and, for each leg, the day it belongs to (a leg is attributed to the day of the stop it arrives at; the final leg to the end point is attributed to the last day that had a stop). Then attributes computed leg durations to days.

- [ ] **Step 1: Write the failing test** `tests/routing/itinerary-route.test.ts`:

```ts
import { test, expect, describe } from "bun:test";
import { orderedRoutePoints, attributeLegDurations } from "@/lib/routing/itinerary-route";
import type { TripDetail, PoiDetail } from "@/lib/api/trips";

function poi(id: string, dayId: string | null, orderInDay: number | null, lat: number, lng: number): PoiDetail {
  return {
    id, name: id, lat, lng, placeId: null, category: null, source: "user",
    isOvernight: false, dayId, orderInDay, status: "accepted",
  };
}

function baseTrip(pois: PoiDetail[], end: { lat: number; lng: number } | null): TripDetail {
  return {
    id: "t", title: "T", description: "",
    startName: "Start", startLat: 0, startLng: 0,
    endName: end ? "End" : null, endLat: end?.lat ?? null, endLng: end?.lng ?? null,
    isRoundTrip: end === null,
    days: [
      { id: "d1", dayIndex: 0, pois: [] },
      { id: "d2", dayIndex: 1, pois: [] },
    ],
    pois,
  };
}

describe("orderedRoutePoints", () => {
  test("orders start, assigned stops by day/order, then end; legs attributed to arrival day", () => {
    const trip = baseTrip(
      [
        poi("a", "d1", 0, 1, 1),
        poi("b", "d2", 0, 2, 2),
        poi("pool", null, null, 9, 9), // excluded
      ],
      { lat: 3, lng: 3 },
    );
    const { coords, legDayId } = orderedRoutePoints(trip);
    expect(coords).toEqual([
      { lat: 0, lng: 0 }, // start
      { lat: 1, lng: 1 }, // a (d1)
      { lat: 2, lng: 2 }, // b (d2)
      { lat: 3, lng: 3 }, // end
    ]);
    // leg 0: start->a (d1), leg 1: a->b (d2), leg 2: b->end (last day d2)
    expect(legDayId).toEqual(["d1", "d2", "d2"]);
  });

  test("round trip returns to start as the final point", () => {
    const trip = baseTrip([poi("a", "d1", 0, 1, 1)], null);
    const { coords } = orderedRoutePoints(trip);
    expect(coords[coords.length - 1]).toEqual({ lat: 0, lng: 0 });
  });

  test("no assigned stops yields just start and end", () => {
    const trip = baseTrip([poi("pool", null, null, 9, 9)], { lat: 3, lng: 3 });
    const { coords, legDayId } = orderedRoutePoints(trip);
    expect(coords).toEqual([{ lat: 0, lng: 0 }, { lat: 3, lng: 3 }]);
    expect(legDayId).toEqual([null]);
  });
});

describe("attributeLegDurations", () => {
  test("sums leg seconds per day and total", () => {
    const result = attributeLegDurations(["d1", "d2", "d2"], [100, 200, 50]);
    expect(result.perDaySeconds).toEqual({ d1: 100, d2: 250 });
    expect(result.totalSeconds).toBe(350);
  });

  test("ignores null-attributed legs in perDay but counts them in total", () => {
    const result = attributeLegDurations([null], [120]);
    expect(result.perDaySeconds).toEqual({});
    expect(result.totalSeconds).toBe(120);
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `bun test tests/routing/itinerary-route.test.ts`
Expected: FAIL — cannot resolve `@/lib/routing/itinerary-route`.

- [ ] **Step 3: Implement `lib/routing/itinerary-route.ts`**

```ts
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
      : start; // round trip loops back to start

  const coords: LatLngLiteral[] = [start, ...assigned.map((p) => ({ lat: p.lat, lng: p.lng })), end];
  const stopDayIds = assigned.map((p) => p.dayId as string);

  // Leg i goes from coords[i] to coords[i+1]. Attribute it to the arrival point's day.
  const legDayId: (string | null)[] = [];
  for (let i = 0; i < coords.length - 1; i++) {
    if (i < stopDayIds.length) {
      legDayId.push(stopDayIds[i]); // arriving at a stop
    } else {
      // final leg to the end point: attribute to the last day that had a stop
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
```

- [ ] **Step 4: Run and confirm pass**

Run: `bun test tests/routing/itinerary-route.test.ts`
Expected: PASS (5 cases).

- [ ] **Step 5: Commit**

```bash
git add lib/routing/itinerary-route.ts tests/routing/itinerary-route.test.ts
git commit -m "feat: add pure itinerary→route transform with tests"
```

---

## Task 3: Route API endpoint

**Files:** create `app/api/trips/[tripId]/route/route.ts`.

> Note the directory is literally named `route` (the trip's route resource), and the handler file is `route.ts` — so the path is `app/api/trips/[tripId]/route/route.ts`.

- [ ] **Step 1: Create `app/api/trips/[tripId]/route/route.ts`**

```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getTrip } from "@/lib/trips/service";
import { computeRoute, RouteError } from "@/lib/routing/routes";
import { orderedRoutePoints, attributeLegDurations } from "@/lib/routing/itinerary-route";
import type { TripDetail } from "@/lib/api/trips";

type Ctx = { params: Promise<{ tripId: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { tripId } = await params;
  const trip = await getTrip(prisma, tripId);
  if (!trip) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { coords, legDayId } = orderedRoutePoints(trip as unknown as TripDetail);
  if (coords.length < 2) {
    return NextResponse.json({
      encodedPolyline: null,
      perDaySeconds: {},
      totalSeconds: 0,
      totalMeters: 0,
    });
  }

  try {
    const route = await computeRoute(coords);
    const { perDaySeconds, totalSeconds } = attributeLegDurations(
      legDayId,
      route.legs.map((l) => l.durationSeconds),
    );
    return NextResponse.json({
      encodedPolyline: route.encodedPolyline,
      perDaySeconds,
      totalSeconds: totalSeconds || route.totalDurationSeconds,
      totalMeters: route.totalDistanceMeters,
    });
  } catch (e) {
    if (e instanceof RouteError) {
      return NextResponse.json({ error: e.message }, { status: 502 });
    }
    throw e;
  }
}
```

- [ ] **Step 2: Verify build**

Run: `bun run build`
Expected: success; `ƒ /api/trips/[tripId]/route` listed.

- [ ] **Step 3: Commit**

```bash
git add app/api/trips/[tripId]/route
git commit -m "feat: add GET /api/trips/[tripId]/route (road route + drive times)"
```

---

## Task 4: Client fetcher + useRoute hook

**Files:** modify `lib/api/trips.ts`; create `hooks/use-route.ts`.

- [ ] **Step 1: Append to `lib/api/trips.ts`**

```ts
export type RouteResult = {
  encodedPolyline: string | null;
  perDaySeconds: Record<string, number>;
  totalSeconds: number;
  totalMeters: number;
};

export async function fetchRoute(tripId: string): Promise<RouteResult> {
  const res = await fetch(`/api/trips/${tripId}/route`);
  if (!res.ok) throw new Error(`Failed to load route (${res.status})`);
  return res.json();
}
```

- [ ] **Step 2: Create `hooks/use-route.ts`**

```ts
import { useQuery } from "@tanstack/react-query";
import { fetchRoute } from "@/lib/api/trips";

export function routeQueryKey(tripId: string) {
  return ["route", tripId] as const;
}

export function useRoute(tripId: string) {
  return useQuery({
    queryKey: routeQueryKey(tripId),
    queryFn: () => fetchRoute(tripId),
  });
}
```

- [ ] **Step 3: Invalidate the route when POIs change** — modify `hooks/use-poi-mutations.ts` so edits refresh the route. Add this import near the top:
```ts
import { routeQueryKey } from "@/hooks/use-route";
```
Then in EACH of the four mutation hooks (`useAddPoi`, `useRemovePoi`, `useMovePoi`, `useSetOvernight`), in their `onSettled`/`onSuccess` callback, ALSO invalidate the route key. For example `useAddPoi`'s `onSuccess` becomes:
```ts
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: tripQueryKey(tripId) });
      qc.invalidateQueries({ queryKey: routeQueryKey(tripId) });
    },
```
Apply the same addition to `useRemovePoi` (onSuccess), `useSetOvernight` (onSuccess), and `useMovePoi` (onSettled). Keep all existing optimistic logic in `useMovePoi` unchanged — only add the route invalidation inside its existing `onSettled`.

- [ ] **Step 4: Verify build**

Run: `bun run build`
Expected: success.

- [ ] **Step 5: Commit**

```bash
git add lib/api/trips.ts hooks/use-route.ts hooks/use-poi-mutations.ts
git commit -m "feat: add useRoute query and invalidate route on POI edits"
```

---

## Task 5: Render the real road polyline on the map

**Files:** modify `components/trip-map.tsx`.

> Add an optional `routePolyline` prop (the encoded polyline). When present, decode it with the Maps geometry library and draw that; when absent (no key/loading/empty), fall back to the existing straight line so the map is never blank.

- [ ] **Step 1: Modify `components/trip-map.tsx`**

(a) Add `routePolyline` to the props of `TripMap`:
```tsx
export function TripMap({
  start,
  end,
  pois = [],
  onAddPlace,
  routePolyline,
}: {
  start: MapPoint;
  end?: MapPoint | null;
  pois?: MapPoint[];
  onAddPlace?: (input: AddPoiInput) => void;
  routePolyline?: string | null;
}) {
```

(b) Pass it to the route line. Replace the existing `<RoutePolyline path={path} />` line with:
```tsx
        <RoutePolyline path={path} encoded={routePolyline} />
```

(c) Replace the whole `RoutePolyline` function with a version that prefers the decoded road geometry:
```tsx
function RoutePolyline({ path, encoded }: { path: MapPoint[]; encoded?: string | null }) {
  const map = useMap();
  const geometry = useMapsLibrary("geometry");
  useEffect(() => {
    if (!map) return;
    let coords: google.maps.LatLngLiteral[] | null = null;
    if (encoded && geometry) {
      coords = geometry.encoding.decodePath(encoded).map((p) => ({ lat: p.lat(), lng: p.lng() }));
    } else if (path.length >= 2) {
      coords = path.map((p) => ({ lat: p.lat, lng: p.lng }));
    }
    if (!coords || coords.length < 2) return;
    const line = new google.maps.Polyline({
      path: coords,
      geodesic: !encoded, // road geometry is already projected; straight fallback uses geodesic
      strokeColor: "#2563eb",
      strokeOpacity: 0.85,
      strokeWeight: 4,
    });
    line.setMap(map);
    return () => line.setMap(null);
  }, [map, geometry, encoded, path]);
  return null;
}
```

- [ ] **Step 2: Verify build**

Run: `bun run build`
Expected: success. (`useMapsLibrary` is already imported in this file.)

- [ ] **Step 3: Commit**

```bash
git add components/trip-map.tsx
git commit -m "feat: draw the real road route polyline on the map"
```

---

## Task 6: Wire route into the planner (polyline + drive times)

**Files:** modify `components/planner-shell.tsx`.

> Add a small `formatDuration` helper, fetch the route with `useRoute`, pass the polyline to `TripMap`, and show per-day drive time on each day header plus a total under the trip title.

- [ ] **Step 1: Modify `components/planner-shell.tsx`**

(a) Add imports (next to the existing hook imports):
```tsx
import { useRoute } from "@/hooks/use-route";
```

(b) Add a module-level helper above the `PlannerShell` component (after imports):
```tsx
function formatDuration(seconds: number): string {
  if (!seconds) return "0 min";
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (h && m) return `${h} h ${m} min`;
  if (h) return `${h} h`;
  return `${m} min`;
}
```

(c) Inside `PlannerShell`, after the `useTrip` line, add:
```tsx
  const { data: route } = useRoute(tripId);
```

(d) Pass the polyline to the map — change the `<TripMap ... />` usage to include the prop:
```tsx
            <TripMap
              start={start}
              end={end}
              pois={poiPoints}
              onAddPlace={handleAddFromMap}
              routePolyline={route?.encodedPolyline ?? null}
            />
```

(e) Show the total under the trip's start/end line. Replace the existing `<p ...>{trip.startName}…</p>` block with:
```tsx
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
```
(If there was a `mb-4` on the old paragraph, the new total line carries the `mb-4`; ensure there's spacing before the search box either way.)

(f) Show per-day drive time on each day header. Replace the day header line:
```tsx
                  <div className="mb-2 text-sm font-medium">Day {day.dayIndex + 1}</div>
```
with:
```tsx
                  <div className="mb-2 flex items-center justify-between text-sm font-medium">
                    <span>Day {day.dayIndex + 1}</span>
                    {route?.perDaySeconds[day.id] ? (
                      <span className="text-xs font-normal text-muted-foreground">
                        🚗 {formatDuration(route.perDaySeconds[day.id])}
                      </span>
                    ) : null}
                  </div>
```

- [ ] **Step 2: Verify build + tests**

Run: `bun run build` (success) then `bun run test` (all pass).

- [ ] **Step 3: Commit**

```bash
git add components/planner-shell.tsx
git commit -m "feat: show road route and per-day/total drive time in the planner"
```

---

## Task 7: Full verification

**Files:** none.

- [ ] **Step 1: Tests + build**

Run: `bun run test` (all pass, incl. routes + itinerary-route suites) and `bun run build` (success; `ƒ /api/trips/[tripId]/route` present).

- [ ] **Step 2: Manual smoke test** (dev server, real key in `.env`, **Routes API enabled** in Google Cloud)

Run `bun run dev`, open a trip, add a few places and drag 2–3 into Day 1 and 1–2 into Day 2, then:
1. The blue line on the map now follows **roads** between start → the assigned stops in order → end (not a straight line).
2. Under the trip title: a **Total driving: X h Y min · Z km** line appears.
3. Day 1 and Day 2 headers show **🚗 <time>** matching the driving within/into each day.
4. Drag a stop to reorder or move between days → the route line and the drive-time numbers update (after the refetch).
5. Pool (unassigned) places are NOT included in the route line.

Expected: all five. If the line stays straight or times are missing, confirm the **Routes API** is enabled for `GOOGLE_MAPS_SERVER_KEY` and check the server logs / network tab for a 502 from `/api/trips/[id]/route`.

- [ ] **Step 3: Final commit (notes, if any)**

```bash
git add -A
git commit -m "docs: phase 2a verified" --allow-empty
```

---

## Phase 2a Done — Definition of Done

- `bun run test` passes (adds routes + itinerary-route suites).
- `bun run build` succeeds with the new route endpoint.
- The map shows the real driving route through assigned stops; the planner shows per-day and total drive time + distance; both refresh when the itinerary changes.

**Next:** Phase 2b — day-split engine ("Build route & split into days" / Re-split, overnight-anchored + drive-cap), within-day waypoint optimization, and draggable route via-points (`RouteVia`).
