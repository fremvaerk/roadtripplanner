# Per-Day Route Building + Colors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compute the route one day-segment at a time (fixing the >25-waypoint Google failure), draw each day's route in its own editable color, and split any day that still exceeds 25 waypoints into stitched batches.

**Architecture:** A pure `buildDayRouteRequests` splits the ordered stop chain into per-day segments at each night (the night is a shared boundary). The route endpoint computes each segment in parallel via `computeRouteChunked` (which splits a segment over 25 intermediates into ≤25 batches), tags each returned leg with its `dayId`, and reports `failedDayIds` for isolated failures. The map colors each leg by `day.color ?? defaultDayColor(dayIndex)`; a reused `GroupColorPicker` on the day card edits the color.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Prisma 7 + libSQL, TanStack Query v5, `@vis.gl/react-google-maps`, Google Routes API, Bun (`bun run test`, `bun run build`).

---

## Reference: conventions

- **Bun.** Tests: `bun run test` (pushes schema to `test.db`, then `bun test`). Build: `bun run build`.
- After any `schema.prisma` change: push to **both** DBs and regenerate, or imports break:
  ```bash
  bunx prisma db push
  DATABASE_URL="file:./test.db" bunx prisma db push
  bunx prisma generate
  ```
- Pure routing helpers live in `lib/routing/`; their tests in `tests/routing/`.
- The Google Routes API caps a single request at **25 intermediate waypoints**.
- `RouteWaypoint = { lat: number; lng: number; via?: boolean }`. A `via:true` waypoint is a pass-through and does **not** create a leg; Google returns one leg per consecutive **stopover** pair.
- Day color picker reuses the existing generic `GroupColorPicker` (`components/group-color-picker.tsx`, props `{ color, label, onChange }`).
- The color palette + helpers live in `lib/places/group-colors.ts` (`PALETTE`, `defaultGroupColor`, `isValidHexColor`).

---

## File Structure

| File | Responsibility | Action |
|------|----------------|--------|
| `prisma/schema.prisma` | `Day.color String?` | Modify |
| `lib/places/group-colors.ts` | `defaultDayColor(dayIndex)` | Modify |
| `lib/api/trips.ts` | `DayDetail.color`; `RouteLegResult.dayId`; `RouteResult.failedDayIds`; `setDayColorRequest` | Modify |
| `lib/routing/itinerary-route.ts` | `buildDayRouteRequests` (replaces `buildRoute`) | Modify |
| `tests/routing/build-route.test.ts` | migrate to `buildDayRouteRequests` | Modify |
| `lib/routing/routes.ts` | `chunkWaypoints`, `computeRouteChunked` | Modify |
| `tests/routing/chunk-waypoints.test.ts` | chunk tests | Create |
| `app/api/trips/[tripId]/route/route.ts` | per-segment parallel compute | Modify |
| `components/trip-map.tsx` | color legs by day | Modify |
| `components/planner-shell.tsx` | `dayColors` map + day-card picker | Modify |
| `lib/itinerary/operations.ts` | `setDayColor` | Modify |
| `lib/itinerary/schema.ts` | `updateDaySchema` | Modify |
| `app/api/days/[dayId]/route.ts` | `PATCH {color}` | Modify |
| `hooks/use-day-mutations.ts` | `useSetDayColor` | Modify |
| `tests/itinerary/day-color.test.ts` | `setDayColor` test | Create |

---

## Task 1: `Day.color` schema + helper + type

**Files:**
- Modify: `prisma/schema.prisma` (`Day` model)
- Modify: `lib/places/group-colors.ts`
- Modify: `lib/api/trips.ts` (`DayDetail`)
- Test: `tests/places/group-colors.test.ts`

- [ ] **Step 1: Add the column**

In `prisma/schema.prisma`, in `model Day { … }`, add after the existing scalar fields (before the relations), e.g. right after the `dayIndex` line:

```prisma
  color      String?
```

- [ ] **Step 2: Push to both DBs and regenerate**

```bash
bunx prisma db push
DATABASE_URL="file:./test.db" bunx prisma db push
bunx prisma generate
```
Expected: each ends "in sync" / "Generated Prisma Client".

- [ ] **Step 3: Write the failing helper test**

In `tests/places/group-colors.test.ts`, add (import `defaultDayColor` alongside the existing imports at the top of the file):

```ts
import { defaultDayColor } from "@/lib/places/group-colors";

describe("defaultDayColor", () => {
  test("indexes the palette and wraps with modulo", () => {
    expect(defaultDayColor(0)).toBe("#ef4444");
    expect(defaultDayColor(8)).toBe(defaultDayColor(0));
    expect(defaultDayColor(9)).toBe(defaultDayColor(1));
  });
});
```

- [ ] **Step 4: Run it — expect FAIL**

Run: `bun run test 2>&1 | tail -8`
Expected: FAIL — `defaultDayColor` is not exported.

- [ ] **Step 5: Add the helper**

In `lib/places/group-colors.ts`, after `defaultGroupColor`, add:

```ts
/** The palette color for a day at `dayIndex`, wrapping with modulo. */
export function defaultDayColor(dayIndex: number): string {
  const n = PALETTE.length;
  return PALETTE[((dayIndex % n) + n) % n];
}
```

- [ ] **Step 6: Add `color` to `DayDetail`**

In `lib/api/trips.ts`, in the `DayDetail` type, add after `dayIndex: number;`:

```ts
  color: string | null;
```

- [ ] **Step 7: Run tests — expect PASS**

Run: `bun run test 2>&1 | tail -8`
Expected: PASS (162 tests).

- [ ] **Step 8: Commit**

```bash
git add prisma/schema.prisma lib/places/group-colors.ts lib/api/trips.ts tests/places/group-colors.test.ts
git commit -m "feat(days): Day.color column + defaultDayColor helper"
```

---

## Task 2: `buildDayRouteRequests` (replaces `buildRoute`)

**Files:**
- Modify: `lib/routing/itinerary-route.ts`
- Test: `tests/routing/build-route.test.ts` (migrate)

- [ ] **Step 1: Write the failing tests**

Replace the entire contents of `tests/routing/build-route.test.ts` with:

```ts
import { test, expect, describe } from "bun:test";
import { buildDayRouteRequests, type TripVia } from "@/lib/routing/itinerary-route";
import type { TripDetail, PoiDetail } from "@/lib/api/trips";

function poi(id: string, dayId: string | null, orderInDay: number | null, lat: number, lng: number): PoiDetail {
  return {
    id, name: id, lat, lng, placeId: null, category: null, source: "user",
    dayId, orderInDay, status: "accepted", groupId: null, orderInGroup: null,
    address: null, description: null, imageUrl: null,
  };
}

function night(id: string, lat: number, lng: number) {
  return { id, lat, lng, title: null, url: null, notes: null };
}

function trip(over: Partial<TripDetail>): TripDetail {
  return {
    id: "t", title: "T", description: "", archivedAt: null,
    startName: "S", startLat: 0, startLng: 0,
    endName: null, endLat: null, endLng: null, isRoundTrip: false,
    startDate: null,
    days: [
      { id: "d1", dayIndex: 0, color: null, pois: [], night: null },
      { id: "d2", dayIndex: 1, color: null, pois: [], night: null },
    ],
    pois: [], poiGroups: [], routeVias: [],
    ...over,
  };
}

describe("buildDayRouteRequests", () => {
  test("one segment per day, split at the night (shared boundary)", () => {
    const t = trip({
      isRoundTrip: false, endLat: 0, endLng: 10,
      days: [
        { id: "d1", dayIndex: 0, color: null, pois: [], night: night("n1", 0, 4) },
        { id: "d2", dayIndex: 1, color: null, pois: [], night: null },
      ],
      pois: [poi("a", "d1", 0, 0, 2), poi("b", "d2", 0, 0, 6)],
    });
    const segs = buildDayRouteRequests(t, []);
    expect(segs.length).toBe(2);
    // segment 1: start(0) -> a(2) -> night1(4)
    expect(segs[0].waypoints.map((w) => w.lng)).toEqual([0, 2, 4]);
    expect(segs[0].legDayId).toEqual(["d1", "d1"]);
    expect(segs[0].legAfterPoiId).toEqual([null, "a"]);
    // segment 2: night1(4) -> b(6) -> terminator(10)
    expect(segs[1].waypoints.map((w) => w.lng)).toEqual([4, 6, 10]);
    expect(segs[1].legDayId).toEqual(["d2", "d2"]);
    expect(segs[1].legAfterPoiId).toEqual([null, "b"]);
  });

  test("a via attaches after its anchor as via:true and does not add a stopover leg", () => {
    const t = trip({
      endLat: 0, endLng: 10,
      days: [
        { id: "d1", dayIndex: 0, color: null, pois: [], night: night("n1", 0, 5) },
        { id: "d2", dayIndex: 1, color: null, pois: [], night: null },
      ],
      pois: [poi("a", "d1", 0, 0, 2)],
    });
    const vias: TripVia[] = [{ id: "v1", afterPoiId: "a", lat: 0, lng: 3, seq: 0 }];
    const segs = buildDayRouteRequests(t, vias);
    // segment 1: start -> a -> (via 3) -> night1
    expect(segs[0].waypoints.map((w) => [w.lng, !!w.via])).toEqual([
      [0, false], [2, false], [3, true], [5, false],
    ]);
    expect(segs[0].legDayId).toEqual(["d1", "d1"]);     // one leg per stopover pair
    expect(segs[0].legAfterPoiId).toEqual([null, "a"]);
  });

  test("round trip terminates back at the start", () => {
    const t = trip({
      isRoundTrip: true, endLat: null, endLng: null,
      days: [{ id: "d1", dayIndex: 0, color: null, pois: [], night: null }],
      pois: [poi("a", "d1", 0, 1, 1)],
    });
    const segs = buildDayRouteRequests(t, []);
    expect(segs.length).toBe(1);
    const wp = segs[0].waypoints;
    expect([wp[0].lat, wp[0].lng]).toEqual([0, 0]);                 // start
    expect([wp[wp.length - 1].lat, wp[wp.length - 1].lng]).toEqual([0, 0]); // back to start
  });

  test("no stops, no nights → single start→terminator segment", () => {
    const t = trip({ endLat: 0, endLng: 10, days: [{ id: "d1", dayIndex: 0, color: null, pois: [], night: null }], pois: [] });
    const segs = buildDayRouteRequests(t, []);
    expect(segs.length).toBe(1);
    expect(segs[0].waypoints.map((w) => w.lng)).toEqual([0, 10]);
    expect(segs[0].legDayId).toEqual([null]);
    expect(segs[0].legAfterPoiId).toEqual([null]);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `bun run test 2>&1 | tail -8`
Expected: FAIL — `buildDayRouteRequests` is not exported.

- [ ] **Step 3: Implement `buildDayRouteRequests`**

In `lib/routing/itinerary-route.ts`, **add** the following (leave the existing `buildRoute`/`BuiltRoute` in place for now — the route endpoint still imports them; they are removed in Task 4 when the endpoint switches over, keeping the build green meanwhile). Add:

```ts
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

  // A night ends its day; the drive after the FINAL night belongs to the next day.
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
      segStart = i; // the night is shared as the next segment's first stopover
    }
  }
  return segments;
}
```

Confirm `RouteWaypoint` and `TripDetail` are imported at the top of the file (they already are: `RouteWaypoint` from `@/lib/routing/routes`, `TripDetail` from `@/lib/api/trips`).

- [ ] **Step 4: Run — expect PASS**

Run: `bun run test 2>&1 | tail -8`
Expected: the new `buildDayRouteRequests` tests PASS (old `buildRoute` still present and used by the endpoint, so `bun run build` also stays green).

- [ ] **Step 5: Commit**

```bash
git add lib/routing/itinerary-route.ts tests/routing/build-route.test.ts
git commit -m "feat(routing): buildDayRouteRequests (per-day segments)"
```

---

## Task 3: `chunkWaypoints` + `computeRouteChunked`

**Files:**
- Modify: `lib/routing/routes.ts`
- Test: `tests/routing/chunk-waypoints.test.ts` (create)

- [ ] **Step 1: Write the failing tests**

Create `tests/routing/chunk-waypoints.test.ts`:

```ts
import { test, expect, describe } from "bun:test";
import { chunkWaypoints, type RouteWaypoint } from "@/lib/routing/routes";

function chain(n: number): RouteWaypoint[] {
  // n waypoints at (0, i)
  return Array.from({ length: n }, (_, i) => ({ lat: 0, lng: i }));
}

describe("chunkWaypoints", () => {
  test("a chain within the limit is one batch", () => {
    const pts = chain(20); // 18 intermediates
    expect(chunkWaypoints(pts, 25)).toEqual([pts]);
  });

  test("splits a 32-waypoint chain (30 intermediates) into shared-boundary batches", () => {
    const pts = chain(32);
    const batches = chunkWaypoints(pts, 25);
    expect(batches.length).toBe(2);
    // each batch has <= 25 intermediates
    for (const b of batches) expect(b.length - 2).toBeLessThanOrEqual(25);
    // boundary is shared: last of batch 0 === first of batch 1
    expect(batches[0][batches[0].length - 1]).toEqual(batches[1][0]);
    // total leg count preserved: sum(len-1) === original len-1
    expect(batches.reduce((s, b) => s + b.length - 1, 0)).toBe(pts.length - 1);
  });

  test("splits on stopover boundaries, never ending a batch on a via", () => {
    const pts = chain(60).map((w, i) => (i % 3 === 0 ? w : { ...w, via: true }));
    const batches = chunkWaypoints(pts, 25);
    for (let i = 0; i < batches.length - 1; i++) {
      const boundary = batches[i][batches[i].length - 1];
      expect(boundary.via).toBeUndefined(); // boundary is a stopover
    }
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `bun run test 2>&1 | tail -8`
Expected: FAIL — `chunkWaypoints` is not exported.

- [ ] **Step 3: Implement**

In `lib/routing/routes.ts`, after `computeRoute`, add:

```ts
/** Split a waypoint chain so each batch has <= maxIntermediates intermediates,
 *  cutting only on stopover (non-via) boundaries and SHARING the boundary waypoint
 *  with the next batch (so the concatenated legs equal the whole chain's legs). */
export function chunkWaypoints(points: RouteWaypoint[], maxIntermediates = 25): RouteWaypoint[][] {
  if (points.length <= maxIntermediates + 2) return [points];
  const batches: RouteWaypoint[][] = [];
  let start = 0;
  while (start < points.length - 1) {
    let end = Math.min(start + maxIntermediates + 1, points.length - 1);
    // back up so the batch ends on a stopover (not a via pass-through)
    while (end > start + 1 && points[end].via) end--;
    batches.push(points.slice(start, end + 1));
    start = end; // share the boundary waypoint
  }
  return batches;
}

/** Compute a (possibly long) segment by chunking into <=25-intermediate batches
 *  and concatenating their legs in order. */
export async function computeRouteChunked(
  points: RouteWaypoint[],
  apiKey: string | undefined = process.env.GOOGLE_MAPS_SERVER_KEY,
  opts: { legPolylines?: boolean } = {},
): Promise<RouteLeg[]> {
  const batches = chunkWaypoints(points);
  const legs: RouteLeg[] = [];
  for (const batch of batches) {
    const r = await computeRoute(batch, apiKey, opts);
    legs.push(...r.legs);
  }
  return legs;
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `bun run test 2>&1 | tail -8`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/routing/routes.ts tests/routing/chunk-waypoints.test.ts
git commit -m "feat(routing): chunkWaypoints + computeRouteChunked (>25-waypoint days)"
```

---

## Task 4: Route endpoint — per-segment parallel compute

**Files:**
- Modify: `app/api/trips/[tripId]/route/route.ts`
- Modify: `lib/api/trips.ts` (`RouteLegResult.dayId`, `RouteResult.failedDayIds`)

- [ ] **Step 1: Extend the result types**

In `lib/api/trips.ts`, change `RouteLegResult` and `RouteResult` to:

```ts
export type RouteLegResult = { encodedPolyline: string | null; afterPoiId: string | null; dayId: string | null };
export type RouteResult = {
  legs: RouteLegResult[];
  perDaySeconds: Record<string, number>;
  perDayMeters: Record<string, number>;
  totalSeconds: number;
  totalMeters: number;
  failedDayIds: string[];
};
```

- [ ] **Step 2: Rewrite the endpoint**

Replace the entire contents of `app/api/trips/[tripId]/route/route.ts` with:

```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getTrip } from "@/lib/trips/service";
import { computeRouteChunked, RouteError } from "@/lib/routing/routes";
import { buildDayRouteRequests, attributeLegDurations, type TripVia } from "@/lib/routing/itinerary-route";
import type { RouteLegResult, TripDetail } from "@/lib/api/trips";

type Ctx = { params: Promise<{ tripId: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { tripId } = await params;
  const trip = await getTrip(prisma, tripId);
  if (!trip) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const vias = ((trip as unknown as { routeVias?: TripVia[] }).routeVias ?? []) as TripVia[];
  const segments = buildDayRouteRequests(trip as unknown as TripDetail, vias);

  if (segments.length === 0) {
    return NextResponse.json({ legs: [], perDaySeconds: {}, perDayMeters: {}, totalSeconds: 0, totalMeters: 0, failedDayIds: [] });
  }

  const results = await Promise.allSettled(
    segments.map((seg) => computeRouteChunked(seg.waypoints, undefined, { legPolylines: true })),
  );

  const legs: RouteLegResult[] = [];
  const legDayIdAll: (string | null)[] = [];
  const legSeconds: number[] = [];
  const legMeters: number[] = [];
  const failed = new Set<string>();

  results.forEach((res, i) => {
    const seg = segments[i];
    if (res.status === "fulfilled") {
      res.value.forEach((leg, j) => {
        legs.push({
          encodedPolyline: leg.encodedPolyline ?? null,
          afterPoiId: seg.legAfterPoiId[j] ?? null,
          dayId: seg.legDayId[j] ?? null,
        });
        legDayIdAll.push(seg.legDayId[j] ?? null);
        legSeconds.push(leg.durationSeconds);
        legMeters.push(leg.distanceMeters);
      });
    } else {
      if (!(res.reason instanceof RouteError)) throw res.reason;
      for (const d of seg.legDayId) if (d) failed.add(d);
    }
  });

  const { perDaySeconds, perDayMeters, totalSeconds, totalMeters } = attributeLegDurations(
    legDayIdAll, legSeconds, legMeters,
  );

  return NextResponse.json({
    legs, perDaySeconds, perDayMeters, totalSeconds, totalMeters,
    failedDayIds: [...failed],
  });
}
```

- [ ] **Step 3: Remove the now-unused `buildRoute`**

In `lib/routing/itinerary-route.ts`, delete the `export type BuiltRoute = { … }` block and the entire `export function buildRoute(…) { … }` (nothing imports them anymore — the endpoint now uses `buildDayRouteRequests`). Keep `orderedRoutePoints`, `attributeLegDurations`, `TripVia`, `DayRouteSegment`, and `buildDayRouteRequests`.

- [ ] **Step 4: Verify build + tests**

Run: `bun run build 2>&1 | tail -5` → Expected "✓ Compiled successfully".
Run: `bun run test 2>&1 | tail -5` → Expected all pass.

- [ ] **Step 5: Commit**

```bash
git add app/api/trips/[tripId]/route/route.ts lib/api/trips.ts lib/routing/itinerary-route.ts
git commit -m "feat(routing): compute route per day in parallel; per-leg dayId + failedDayIds"
```

---

## Task 5: Color each day's route on the map

**Files:**
- Modify: `components/trip-map.tsx`
- Modify: `components/planner-shell.tsx`

- [ ] **Step 1: Thread a `dayColors` prop into `TripMap` and `RouteLegs`**

In `components/trip-map.tsx`:

1. Add `dayColors` to the `TripMap` props type and destructuring. Find the props object (the component's parameter list) and add:
   ```tsx
   dayColors = {},
   ```
   to the destructured params, and in the props type add:
   ```tsx
   dayColors?: Record<string, string>;
   ```
2. Where `TripMap` renders `<RouteLegs legs={legs} onAddVia={onAddVia} />` (around line 193), change it to:
   ```tsx
   <RouteLegs legs={legs} dayColors={dayColors} onAddVia={onAddVia} />
   ```
3. In the `RouteLegs` component, add `dayColors` to its props type and destructuring:
   ```tsx
   function RouteLegs({
     legs,
     dayColors = {},
     onAddVia,
   }: {
     legs: RouteLegResult[];
     dayColors?: Record<string, string>;
     onAddVia?: (afterPoiId: string | null, lat: number, lng: number) => void;
   }) {
   ```
4. In the `new google.maps.Polyline({ … })` call, change the `strokeColor` line from `strokeColor: "#2563eb",` to:
   ```tsx
   strokeColor: dayColors[leg.dayId ?? ""] ?? "#2563eb",
   ```
5. Add `dayColors` to the effect's dependency array: change `}, [map, geometry, legs]);` to `}, [map, geometry, legs, dayColors]);`.

- [ ] **Step 2: Build the `dayColors` map in `planner-shell` and pass it**

In `components/planner-shell.tsx`:

1. Add the import (near the other `group-colors` import — `darken, UNGROUPED_COLOR` are already imported from there):
   ```ts
   import { darken, UNGROUPED_COLOR, defaultDayColor } from "@/lib/places/group-colors";
   ```
   (Replace the existing `import { darken, UNGROUPED_COLOR } from "@/lib/places/group-colors";` line.)
2. Near the other `useMemo`s in the component body, add:
   ```ts
   const dayColors = useMemo(
     () => Object.fromEntries(trip.days.map((d) => [d.id, d.color ?? defaultDayColor(d.dayIndex)])),
     [trip.days],
   );
   ```
   (`useMemo` is already imported. This must be after `trip` is known to be non-null — place it alongside the other derived values that use `trip`, i.e. after the loading/error guards.)
3. In the `<TripMap … />` usage, add the prop:
   ```tsx
   dayColors={dayColors}
   ```

- [ ] **Step 3: Build**

Run: `bun run build 2>&1 | tail -5`
Expected: "✓ Compiled successfully", no type errors.

- [ ] **Step 4: Commit**

```bash
git add components/trip-map.tsx components/planner-shell.tsx
git commit -m "feat(map): color each day's route by its resolved day color"
```

---

## Task 6: Edit a day's color

**Files:**
- Modify: `lib/itinerary/operations.ts` (`setDayColor`)
- Modify: `lib/itinerary/schema.ts` (`updateDaySchema`)
- Modify: `app/api/days/[dayId]/route.ts` (`PATCH`)
- Modify: `lib/api/trips.ts` (`setDayColorRequest`)
- Modify: `hooks/use-day-mutations.ts` (`useSetDayColor`)
- Modify: `components/planner-shell.tsx` (day-card picker)
- Test: `tests/itinerary/day-color.test.ts` (create)

- [ ] **Step 1: Write the failing service test**

Create `tests/itinerary/day-color.test.ts`:

```ts
import { test, expect, describe, beforeEach, afterAll } from "bun:test";
import { PrismaClient } from "@/lib/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { createTrip } from "@/lib/trips/service";
import { setDayColor } from "@/lib/itinerary/operations";

const prisma = new PrismaClient({
  adapter: new PrismaLibSql({ url: process.env.DATABASE_URL ?? "file:./test.db" }),
});

beforeEach(async () => {
  await prisma.poi.deleteMany();
  await prisma.day.deleteMany();
  await prisma.trip.deleteMany();
});
afterAll(async () => { await prisma.$disconnect(); });

describe("setDayColor", () => {
  test("sets a day's color", async () => {
    const trip = await createTrip(prisma, {
      title: "T", description: "", startDate: null, dayCount: 1,
      start: { name: "S", lat: 0, lng: 0, placeId: null },
    });
    const day = trip.days[0];
    const updated = await setDayColor(prisma, day.id, "#22c55e");
    expect(updated.color).toBe("#22c55e");
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `bun run test 2>&1 | tail -8`
Expected: FAIL — `setDayColor` is not exported.

- [ ] **Step 3: Implement the service function**

In `lib/itinerary/operations.ts`, add (near `setNight` / the other day ops):

```ts
export async function setDayColor(prisma: PrismaClient, dayId: string, color: string) {
  return prisma.day.update({ where: { id: dayId }, data: { color } });
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `bun run test 2>&1 | tail -8`
Expected: PASS.

- [ ] **Step 5: Add the validation schema**

In `lib/itinerary/schema.ts`, add (near `updateGroupSchema`):

```ts
export const updateDaySchema = z.object({
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Must be a #rrggbb hex color"),
});
```

- [ ] **Step 6: Add the PATCH route**

In `app/api/days/[dayId]/route.ts`, add a `PATCH` handler and the imports. The file currently imports `removeDay`; change/extend it:

```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { removeDay, setDayColor, ItineraryError } from "@/lib/itinerary/operations";
import { updateDaySchema } from "@/lib/itinerary/schema";

type Ctx = { params: Promise<{ dayId: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const { dayId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = updateDaySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const exists = await prisma.day.findUnique({ where: { id: dayId }, select: { id: true } });
  if (!exists) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const day = await setDayColor(prisma, dayId, parsed.data.color);
  return NextResponse.json(day);
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { dayId } = await params;
  try {
    await removeDay(prisma, dayId);
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    if (e instanceof ItineraryError) {
      return NextResponse.json({ error: e.message }, { status: 404 });
    }
    throw e;
  }
}
```

- [ ] **Step 7: Add the client request helper**

In `lib/api/trips.ts`, add (near `setGroupColorRequest`):

```ts
export async function setDayColorRequest(dayId: string, color: string): Promise<void> {
  const res = await fetch(`/api/days/${dayId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ color }),
  });
  if (!res.ok) throw new Error(`Failed to set day color (${res.status})`);
}
```

- [ ] **Step 8: Add the mutation hook**

In `hooks/use-day-mutations.ts`, add `setDayColorRequest` to the import from `@/lib/api/trips`, then append:

```ts
export function useSetDayColor(tripId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { dayId: string; color: string }) => setDayColorRequest(v.dayId, v.color),
    onSuccess: () => invalidate(qc, tripId),
  });
}
```

- [ ] **Step 9: Add the picker to the day card**

In `components/planner-shell.tsx`:

1. Add imports:
   ```ts
   import { GroupColorPicker } from "@/components/group-color-picker";
   import { useSetDayColor } from "@/hooks/use-day-mutations";
   ```
2. In the component body (with the other hooks), add:
   ```ts
   const setDayColor = useSetDayColor(tripId);
   ```
3. In the day-card header `<span>Day {day.dayIndex + 1} …</span>` block, wrap the day label and a picker. Change the opening of the header `<span>` group so the picker sits just before "Day N". Replace:
   ```tsx
                   <span>
                     Day {day.dayIndex + 1}
   ```
   with:
   ```tsx
                   <span className="flex items-center gap-2">
                     <GroupColorPicker
                       color={day.color ?? defaultDayColor(day.dayIndex)}
                       label={`Day ${day.dayIndex + 1}`}
                       onChange={(hex) => setDayColor.mutate({ dayId: day.id, color: hex })}
                     />
                     <span>Day {day.dayIndex + 1}</span>
   ```
   and add a matching extra `</span>` to close the new inner `<span>Day …</span>` — i.e. the date suffix and the original closing `</span>` now belong to the wrapper. Concretely, the block becomes:
   ```tsx
                   <span className="flex items-center gap-2">
                     <GroupColorPicker
                       color={day.color ?? defaultDayColor(day.dayIndex)}
                       label={`Day ${day.dayIndex + 1}`}
                       onChange={(hex) => setDayColor.mutate({ dayId: day.id, color: hex })}
                     />
                     <span>
                       Day {day.dayIndex + 1}
                       {formatDayDate(trip.startDate, day.dayIndex) ? (
                         <span className="ml-1 font-normal text-muted-foreground">
                           · {formatDayDate(trip.startDate, day.dayIndex)}
                         </span>
                       ) : null}
                     </span>
                   </span>
   ```
   (`defaultDayColor` is already imported from Task 5 Step 2.)

- [ ] **Step 10: Build + tests**

Run: `bun run build 2>&1 | tail -5` → "✓ Compiled successfully".
Run: `bun run test 2>&1 | tail -5` → all pass.

- [ ] **Step 11: Commit**

```bash
git add lib/itinerary/operations.ts lib/itinerary/schema.ts app/api/days/[dayId]/route.ts lib/api/trips.ts hooks/use-day-mutations.ts components/planner-shell.tsx tests/itinerary/day-color.test.ts
git commit -m "feat(days): edit a day's route color (PATCH /api/days/[dayId] + day-card picker)"
```

---

## Task 7: Verification

**Files:** none (verification only)

- [ ] **Step 1: Full test suite**

Run: `bun run test 2>&1 | tail -6`
Expected: all pass (≈165 tests).

- [ ] **Step 2: Production build**

Run: `bun run build 2>&1 | tail -5`
Expected: "✓ Compiled successfully", no type errors.

- [ ] **Step 3: Live smoke (the Nordkapp trip)**

Restart the dev server if the Prisma client changed since it started (`pkill -f "next dev"` then `bun run dev &`). Open the Nordkapp trip (`/trips/...`; find the id via `GET /api/trips`). Verify:
1. The map draws **per-day colored routes** end to end (no 502) — each day a distinct color.
2. Each day card shows a **drive time** (`🚗 …`) and a color **swatch**; "Total driving" is populated.
3. Clicking a day's swatch → palette/custom picker → choosing a color **recolors that day's line** immediately.
4. No console errors (the previous "Too many intermediate waypoints" is gone).

- [ ] **Step 4: Final whole-branch review**

Dispatch a final code review over `git diff main...HEAD` against the spec at `docs/superpowers/specs/2026-06-10-per-day-route-building-and-colors-design.md`. Apply high-confidence fixes.

- [ ] **Step 5: Finish the branch**

Use `superpowers:finishing-a-development-branch` (tests pass → present options → merge to `main` `--no-ff`, delete branch).

---

## Notes for the implementer

- **Why segments share the night waypoint:** segment _k_ ends *at* night _k_ (its destination) and segment _k+1_ starts *from* night _k_ (its origin). Each segment is a standalone Google request; the shared waypoint produces no duplicate leg because each segment's legs are internal to it.
- **Leg counts:** Google returns one leg per stopover pair; `via:true` waypoints don't add legs. `legDayId`/`legAfterPoiId` are sized to stopover-legs and line up 1:1 with the legs `computeRouteChunked` returns for that segment.
- **Per-day requests always:** even a short trip is computed per day (uniform behavior, exact per-day distances). N small Google calls run in parallel.
- **Partial failure:** `Promise.allSettled` isolates a failing day into `failedDayIds`; non-`RouteError` rejections (bugs) still throw. The map simply draws no line for a failed day.
