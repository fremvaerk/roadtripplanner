# Per-Day Route Building + Colors — Design

**Date:** 2026-06-10
**Status:** Approved design, ready for implementation planning
**Type:** Feature / refactor of the route engine + map rendering

## Summary

Compute the trip route **one day at a time** instead of in a single Google Routes
call, draw **each day's route in its own color**, and **split a day that exceeds
Google's 25-waypoint limit** into stitched batches. This fixes the hard failure on
rich trips (Google rejects >25 intermediate waypoints in one request) and makes the
map far more legible (you can see where each day goes).

## Background / problem

Today `GET /api/trips/[tripId]/route` builds one ordered waypoint chain
(`buildRoute`: start + every assigned POI + every night + terminator) and calls
`computeRoute` **once**. Google's Routes API caps a single request at **25
intermediate waypoints**; the 10-day Nordkapp trip has 30, so the request returns
HTTP 400 and the map shows no route and no per-day drive times. The map also draws
every leg in one fixed blue (`#2563eb`).

## Goals

- One Google request **per day segment** (split at nights), computed in parallel.
- Each day's polyline rendered in the day's own color.
- Auto color from a fixed palette by day order, **editable** per day.
- A day with >25 intermediate waypoints is split into ≤25 batches and stitched.
- Independent per-day failures: a day that can't route doesn't break the others.

## Non-Goals (YAGNI)

- Re-ordering/optimizing stops within a day (separate existing "optimize" feature).
- A route-color legend UI beyond the per-day swatch on the day card.
- Caching/persisting computed routes (still computed on demand).
- Changing how nights/stops/days are created.

## Architecture

### 1. Per-day segmentation — `lib/routing/itinerary-route.ts`

Add a pure function that replaces `buildRoute` for the endpoint:

```
buildDayRouteRequests(trip, vias): DayRouteSegment[]
```

where

```ts
type DayRouteSegment = {
  waypoints: RouteWaypoint[];          // stopovers + vias(via:true), in order
  legDayId: (string | null)[];         // one per STOPOVER leg (see below)
  legAfterPoiId: (string | null)[];    // one per STOPOVER leg
};
```

Google returns one leg per consecutive **stopover** pair; `via:true` waypoints are
pass-throughs that do **not** create legs. So `legDayId` / `legAfterPoiId` are
indexed by stopover-legs — their length is `(#stopovers in the segment) − 1`, which
equals the number of legs Google returns for that segment. This mirrors how the
current `buildRoute` already derives leg metadata from the stopover list while
sending vias inside the waypoint array.

Algorithm:

1. Order days by `dayIndex`. Build each day's stop list (`pois` with that `dayId`,
   sorted by `orderInDay`), attaching route vias after their anchor POI (and
   start-anchored vias right after the trip start), exactly as `buildRoute` does
   today.
2. Walk start → (each day: its stops, then its night) → terminator, producing a
   flat list of stopovers tagged with `{ dayId, poiId, isNight }`. The terminator
   is `endPlace` for a specific finish, the start for a round trip, or omitted for
   an open trip (the route then ends at the last stop).
3. **Cut the chain into segments after each night.** Each night is the *last*
   waypoint of its segment **and the first waypoint of the next segment** (shared
   boundary so consecutive days connect). The trailing run after the last night
   (to the terminator) is its own segment. Result: normally one segment per day; a
   night-less middle day merges into the following night's segment but its legs
   keep their own `dayId` (so coloring/attribution stay per-day).
4. For each segment, `legDayId[i]` = the **arrival** waypoint's `dayId` (the drive
   after a night belongs to the next day — same rule as today's `buildRoute`,
   including the trailing-day fallback); `legAfterPoiId[i]` = the **departure**
   waypoint's `poiId`. Vias are carried as `via:true` waypoints and do not create
   leg breaks.

`buildRoute` is removed (superseded); its unit tests migrate to
`buildDayRouteRequests`. `attributeLegDurations` is unchanged and reused.

### 2. Chunking a long day — `lib/routing/routes.ts`

Add a pure helper and a chunked compute:

```ts
chunkWaypoints(points: RouteWaypoint[], maxIntermediates = 25): RouteWaypoint[][]
```

Splits `[w0 … wn]` so each batch has ≤ `maxIntermediates` intermediates (both
stopovers and `via:true` points count toward Google's limit), with each batch
**sharing its boundary waypoint** with the next (`… w25]`, `[w25 …`) so the path is
continuous and no stopover leg is lost or duplicated. Splits fall on **stopover**
boundaries (never mid-via-run), so each batch is a self-contained sub-route whose
returned legs are whole stopover legs. A segment within the limit yields a single
batch (one request); in practice a single day is always one batch — this is the
safety net for a pathological >25-stop day.

```ts
computeRouteChunked(points, apiKey?, opts): Promise<RouteLeg[]>
```

Maps each batch through the existing `computeRoute` and concatenates the returned
legs in order, giving exactly one leg per stopover pair across the whole segment.
The existing single-shot `computeRoute` stays as-is and is what
`computeRouteChunked` calls per batch.

### 3. Route endpoint — `app/api/trips/[tripId]/route/route.ts`

For each segment from `buildDayRouteRequests`, call `computeRouteChunked` (in
parallel via `Promise.allSettled`). Concatenate all segments' legs with their
`legDayId` / `legAfterPoiId`. Then:

- `attributeLegDurations` over the concatenated `legDayId` → `perDaySeconds` /
  `perDayMeters` / totals (unchanged).
- A segment whose compute rejects contributes **no legs**; record its day ids in
  `failedDayIds`. The endpoint still returns 200 with whatever computed (only an
  empty result with at least one failure could be considered an error — but we
  return 200 so partial routes draw).

New response shape (additive):

```ts
type RouteLegResult = {
  encodedPolyline: string | null;
  afterPoiId: string | null;
  dayId: string | null;        // NEW — drives per-day color
};
type RouteResult = {
  legs: RouteLegResult[];
  perDaySeconds: Record<string, number>;
  perDayMeters: Record<string, number>;
  totalSeconds: number;
  totalMeters: number;
  failedDayIds: string[];      // NEW — days whose route couldn't compute
};
```

### 4. Day color — data model + helper

- **Schema:** add `color String?` to `Day` (`null` ⇒ auto). Push to `dev.db` and
  `test.db`, regenerate the client.
- **Helper:** `defaultDayColor(dayIndex)` in `lib/places/group-colors.ts`, reusing
  the existing 8-color `PALETTE` (wrapping with modulo). Resolved color is
  `day.color ?? defaultDayColor(day.dayIndex)`.
- `DayDetail` (in `lib/api/trips.ts`) gains `color: string | null`; `getTrip`
  already returns all `Day` scalar fields, so no query change.

### 5. Map rendering — `components/trip-map.tsx`

`TripMap` receives a `dayColors: Record<string, string>` map (built in
`planner-shell` from `trip.days` via the resolved color). `RouteLegs` colors each
polyline by `dayColors[leg.dayId] ?? "#2563eb"` (fallback for a null/missing day)
instead of the fixed blue. Stroke weight/opacity unchanged. A leg in `failedDayIds`
simply has no polyline (nothing to draw).

### 6. Day color editing UI

- **Service:** `setDayColor(prisma, dayId, color)` in `lib/itinerary/operations.ts`.
- **API:** add `PATCH` to `app/api/days/[dayId]/route.ts` with body `{ color }`
  (validated `#rrggbb` via the existing hex regex). Returns the updated day.
- **Client:** `setDayColorRequest(dayId, color)` in `lib/api/trips.ts`;
  `useSetDayColor(dayId)` in `hooks/use-day-mutations.ts` invalidating **both** the
  trip query and the route query (so the map recolors live).
- **UI:** reuse the existing generic `GroupColorPicker` (props: `color`, `label`,
  `onChange`) on each day-card header next to "Day N"; `onChange` →
  `useSetDayColor(day.id).mutate(hex)`.

## Data Flow

`GET /route` → `buildDayRouteRequests` → N parallel `computeRouteChunked` calls →
concatenated legs (each tagged `dayId`) + `failedDayIds` → map draws each leg in
`resolveDayColor(day)`. Editing a day's color → `PATCH /api/days/[dayId] {color}` →
invalidate trip+route queries → map recolors.

## Error Handling

- Per-segment `Promise.allSettled`: one day's Google error is isolated; its days go
  into `failedDayIds` and the rest of the map still renders.
- `computeRouteChunked` surfaces a `RouteError` for a batch failure → that segment
  is marked failed.
- Missing `GOOGLE_MAPS_SERVER_KEY` still throws (configuration error, not per-day).
- Invalid color in the PATCH → 400 (zod).

## Testing

Pure-function unit tests (no Google calls):
- `buildDayRouteRequests`: one segment per day; nights are shared boundaries; the
  trailing segment runs to the terminator (round/place/open); a day's stops sort by
  `orderInDay`; vias attach after their anchor as `via:true`; leg `dayId` follows
  the "drive-after-night belongs to next day" rule.
- `chunkWaypoints`: a 30-intermediate segment → two batches of ≤25 that share the
  boundary and preserve total leg count; a ≤25 segment → one batch.
- `defaultDayColor`: palette indexing wraps with modulo.
- `setDayColor`: sets a valid hex; (schema/zod) rejects a non-hex color.

Live smoke (the Nordkapp trip): 10 day-routes each in a distinct color, per-day
drive times populated, total driving shown; changing a day's color via the swatch
recolors that day's line immediately; no console errors.

## Build Phases

1. Schema `Day.color` + `defaultDayColor` helper + `DayDetail.color` (+ tests).
2. `buildDayRouteRequests` + remove `buildRoute` (migrate tests).
3. `chunkWaypoints` + `computeRouteChunked` (+ tests).
4. Route endpoint: per-segment parallel compute, `dayId` per leg, `failedDayIds`.
5. Map coloring (`dayColors` → `RouteLegs`) + `planner-shell` wiring.
6. Day color editing: `setDayColor` service, `PATCH /api/days/[dayId]`,
   `useSetDayColor`, `GroupColorPicker` on the day card.
7. Verification (unit tests, build, live smoke on the Nordkapp trip).

## Out of Scope / Future

Stop optimization within a day, a route legend, persisting computed routes,
multi-night days. No-auth posture unchanged.
