# Phase 2c — Day-Split Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn a pile of unassigned places into a day-by-day plan: "Build route & split into days" orders the pool along the start→end corridor, splits it across the trip's days under a daily drive-time cap, and assigns each place to a day (keeping any overnight last); "Re-split all" redoes the whole trip from scratch.

**Architecture:** Two pure, unit-tested modules — `corridor` (orders stops by projection onto the start→end line, nearest-neighbor fallback for round trips) and `split` (greedy drive-cap assignment of ordered stops to days). A `splitPoolIntoDays` operation loads the trip, orders the pool, fetches sequential leg durations from the Routes API (injectable for tests), runs the engine, and persists assignments transactionally (overnight stays last in each day). `resplitAll` moves every stop back to the pool first. Endpoints + hooks + two sidebar buttons (Re-split confirms first) wire it up.

**Tech Stack:** Next.js 16 + React 19, Prisma 7, Google Routes API (`computeRoute`), TanStack Query v5, Bun test runner.

---

## Context for the implementer (state after Phase 2b)

- `lib/routing/routes.ts` exports `computeRoute(points: LatLngLiteral[], apiKey?, opts?)` → `ComputedRoute { encodedPolyline, legs: { durationSeconds, distanceMeters }[], totalDurationSeconds, totalDistanceMeters, optimizedOrder? }`, plus `LatLngLiteral`, `ComputedRoute`, `RouteError`.
- `lib/itinerary/operations.ts` exports `ItineraryError`, `addPoi`, `removePoi`, `movePoi`, `setOvernight`, `optimizeDay`, plus a `ComputeRouteFn` type used by `optimizeDay`. It imports `{ computeRoute, type ComputedRoute }` and `applyOptimizedOrder`. Generated client at `@/lib/generated/prisma/client`. Interactive `$transaction(async (tx) => …)` works (libSQL).
- `lib/trips/service.ts` `getTrip(prisma, id)` returns the trip incl. `startLat/startLng`, `endLat/endLng` (nullable → round trip), `params` (a `String?` holding serialized JSON or null), `days` (ordered, with nested ordered `pois`), and flat `pois`. `Poi` has `id, dayId, orderInDay, isOvernight, lat, lng`.
- `lib/api/trips.ts` has `TripDetail`, fetchers. `hooks/use-trip.ts` → `tripQueryKey`; `hooks/use-route.ts` → `routeQueryKey`. `hooks/use-poi-mutations.ts` exports the mutation hooks (each invalidates trip + route).
- `components/planner-shell.tsx` renders the sidebar: trip title, start→end + total-driving lines, `<PlaceSearch>`, the pool `<PoiContainer id="pool">`, then per-day blocks. It has `useTrip`, `useRoute`, `useAddPoi`, `useMovePoi`, `useOptimizeDay`, a `byDay(dayId)` helper, `pool` (= `byDay(null)`), and `Button` imported.
- DB tests run via `bun run test` and instantiate `new PrismaClient({ adapter: new PrismaLibSql({ url: process.env.DATABASE_URL ?? "file:./test.db" }) })`. Git identity configured; NO AI co-author trailer.

**Engine decisions (locked):** corridor-projection ordering (nearest-neighbor fallback when start≈end); greedy split under a daily drive cap; default cap **5 h** (`18000s`), overridden by `trip.params.dailyDriveMaxSeconds` when present; last day absorbs the remainder; a day's **overnight stays last**. **Build** splits the pool only (keeps manual placements); **Re-split all** moves everything back to the pool, then builds.

---

## File Structure

```
lib/routing/corridor.ts                  (CREATE) pure: haversineMeters, orderByCorridor
lib/routing/split.ts                     (CREATE) pure: splitByDriveCap + DEFAULT_DAILY_DRIVE_MAX_SECONDS
lib/itinerary/split-trip.ts              (CREATE) splitPoolIntoDays, resplitAll (DB + injected computeFn)
app/api/trips/[tripId]/split/route.ts    (CREATE) POST: build (pool-only) split
app/api/trips/[tripId]/resplit/route.ts  (CREATE) POST: re-split everything
lib/api/trips.ts                         (MODIFY) add buildSplitRequest, resplitRequest
hooks/use-poi-mutations.ts               (MODIFY) add useBuildSplit, useResplit
components/planner-shell.tsx             (MODIFY) "Build route & split" + "Re-split all" buttons
tests/routing/corridor.test.ts           (CREATE)
tests/routing/split.test.ts              (CREATE)
tests/itinerary/split-trip.test.ts       (CREATE)
```

---

## Task 1: Corridor ordering — TDD

**Files:** create `lib/routing/corridor.ts`; test `tests/routing/corridor.test.ts`.

- [ ] **Step 1: Write the failing test** `tests/routing/corridor.test.ts`:

```ts
import { test, expect, describe } from "bun:test";
import { orderByCorridor, haversineMeters } from "@/lib/routing/corridor";

type P = { id: string; lat: number; lng: number };

describe("haversineMeters", () => {
  test("is ~0 for the same point and positive for different points", () => {
    expect(haversineMeters({ lat: 0, lng: 0 }, { lat: 0, lng: 0 })).toBe(0);
    expect(haversineMeters({ lat: 0, lng: 0 }, { lat: 0, lng: 1 })).toBeGreaterThan(100000);
  });
});

describe("orderByCorridor", () => {
  test("orders stops by progress from start to end (directional trip)", () => {
    const start = { lat: 0, lng: 0 };
    const end = { lat: 0, lng: 10 };
    const stops: P[] = [
      { id: "c", lat: 0.1, lng: 8 },
      { id: "a", lat: -0.1, lng: 2 },
      { id: "b", lat: 0.2, lng: 5 },
    ];
    expect(orderByCorridor(stops, start, end).map((s) => s.id)).toEqual(["a", "b", "c"]);
  });

  test("round trip (start≈end) falls back to nearest-neighbor from start", () => {
    const start = { lat: 0, lng: 0 };
    const end = { lat: 0, lng: 0 };
    const stops: P[] = [
      { id: "far", lat: 0, lng: 9 },
      { id: "near", lat: 0, lng: 1 },
      { id: "mid", lat: 0, lng: 5 },
    ];
    expect(orderByCorridor(stops, start, end).map((s) => s.id)).toEqual(["near", "mid", "far"]);
  });

  test("returns a new array and leaves the input unmutated", () => {
    const start = { lat: 0, lng: 0 };
    const end = { lat: 0, lng: 10 };
    const stops: P[] = [
      { id: "b", lat: 0, lng: 5 },
      { id: "a", lat: 0, lng: 1 },
    ];
    const out = orderByCorridor(stops, start, end);
    expect(out).not.toBe(stops);
    expect(stops.map((s) => s.id)).toEqual(["b", "a"]);
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `bun test tests/routing/corridor.test.ts`
Expected: FAIL — cannot resolve `@/lib/routing/corridor`.

- [ ] **Step 3: Implement `lib/routing/corridor.ts`**

```ts
import type { LatLngLiteral } from "@/lib/routing/routes";

export function haversineMeters(a: LatLngLiteral, b: LatLngLiteral): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Order stops along the start→end corridor by projecting each onto the start→end
 * vector. For a round trip (start ≈ end) the projection is undefined, so fall back
 * to a nearest-neighbor chain starting from `start`.
 */
export function orderByCorridor<T extends LatLngLiteral>(
  stops: T[],
  start: LatLngLiteral,
  end: LatLngLiteral,
): T[] {
  const vLat = end.lat - start.lat;
  const vLng = end.lng - start.lng;
  const vLen2 = vLat * vLat + vLng * vLng;

  if (vLen2 > 1e-9) {
    return [...stops].sort((p, q) => projection(p) - projection(q));
    function projection(p: LatLngLiteral): number {
      return ((p.lat - start.lat) * vLat + (p.lng - start.lng) * vLng) / vLen2;
    }
  }

  // Round-trip fallback: nearest-neighbor chain from start.
  const remaining = [...stops];
  const ordered: T[] = [];
  let cursor: LatLngLiteral = start;
  while (remaining.length) {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = haversineMeters(cursor, remaining[i]);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    const [next] = remaining.splice(bestIdx, 1);
    ordered.push(next);
    cursor = next;
  }
  return ordered;
}
```

- [ ] **Step 4: Run and confirm pass**

Run: `bun test tests/routing/corridor.test.ts`
Expected: PASS (4 cases).

- [ ] **Step 5: Commit**

```bash
git add lib/routing/corridor.ts tests/routing/corridor.test.ts
git commit -m "feat: add corridor ordering (projection + NN fallback) with tests"
```

---

## Task 2: Drive-cap split — TDD

**Files:** create `lib/routing/split.ts`; test `tests/routing/split.test.ts`.

> `splitByDriveCap` assigns each ordered stop a day index. `legSeconds[i]` is the driving time from the previous route point to stop `i` (so `legSeconds[0]` is the drive from `start` to the first stop). A day accumulates its stops' leg seconds; before adding a stop that would push the day over the cap — and only if the day already has a stop and we're not on the last day — it advances to the next day (that stop's leg becomes the new day's first/"morning" drive). The last day absorbs everything remaining.

- [ ] **Step 1: Write the failing test** `tests/routing/split.test.ts`:

```ts
import { test, expect, describe } from "bun:test";
import { splitByDriveCap, DEFAULT_DAILY_DRIVE_MAX_SECONDS } from "@/lib/routing/split";

describe("splitByDriveCap", () => {
  test("advances a day when the cap would be exceeded", () => {
    // legs 60,60,60,60; cap 100; 3 days
    expect(splitByDriveCap([60, 60, 60, 60], 3, 100)).toEqual([0, 1, 2, 2]);
  });

  test("keeps stops together while under the cap", () => {
    expect(splitByDriveCap([30, 30, 30], 3, 100)).toEqual([0, 0, 0]);
  });

  test("never creates an empty day from a single over-cap leg (first stop of a day)", () => {
    // each leg alone exceeds cap; still one stop per day until days run out
    expect(splitByDriveCap([200, 200, 200], 2, 100)).toEqual([0, 1, 1]);
  });

  test("the last day absorbs the remainder regardless of cap", () => {
    expect(splitByDriveCap([60, 60, 60, 60, 60], 2, 100)).toEqual([0, 1, 1, 1, 1]);
  });

  test("handles a single day", () => {
    expect(splitByDriveCap([60, 60, 60], 1, 100)).toEqual([0, 0, 0]);
  });

  test("exposes a sane default cap", () => {
    expect(DEFAULT_DAILY_DRIVE_MAX_SECONDS).toBe(5 * 3600);
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `bun test tests/routing/split.test.ts`
Expected: FAIL — cannot resolve `@/lib/routing/split`.

- [ ] **Step 3: Implement `lib/routing/split.ts`**

```ts
export const DEFAULT_DAILY_DRIVE_MAX_SECONDS = 5 * 3600;

/**
 * Assign each ordered stop a day index in [0, dayCount-1] by greedily filling days
 * up to `capSeconds` of driving. `legSeconds[i]` is the drive from the previous
 * route point to stop i. The last day absorbs any remainder; a day is never left
 * empty by a single over-cap leg.
 */
export function splitByDriveCap(
  legSeconds: number[],
  dayCount: number,
  capSeconds: number,
): number[] {
  const days = Math.max(1, dayCount);
  const assignment: number[] = [];
  let dayIdx = 0;
  let dayDrive = 0;
  let dayHasStop = false;

  for (let i = 0; i < legSeconds.length; i++) {
    const leg = legSeconds[i] ?? 0;
    if (dayHasStop && dayIdx < days - 1 && dayDrive + leg > capSeconds) {
      dayIdx += 1;
      dayDrive = 0;
      dayHasStop = false;
    }
    assignment.push(dayIdx);
    dayDrive += leg;
    dayHasStop = true;
  }

  return assignment;
}
```

- [ ] **Step 4: Run and confirm pass**

Run: `bun test tests/routing/split.test.ts`
Expected: PASS (6 cases).

- [ ] **Step 5: Commit**

```bash
git add lib/routing/split.ts tests/routing/split.test.ts
git commit -m "feat: add drive-cap day-split helper with tests"
```

---

## Task 3: `splitPoolIntoDays` operation — TDD

**Files:** create `lib/itinerary/split-trip.ts`; test `tests/itinerary/split-trip.test.ts`.

> Loads the trip, orders the pool by corridor, gets sequential leg durations from the injected `computeFn`, runs `splitByDriveCap`, and assigns each pool stop to its day — appended after that day's existing non-overnight stops but **before** the day's overnight. Persists transactionally.

- [ ] **Step 1: Write the failing test** `tests/itinerary/split-trip.test.ts`:

```ts
import { test, expect, describe, beforeEach, afterAll } from "bun:test";
import { PrismaClient } from "@/lib/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { addPoi, setOvernight } from "@/lib/itinerary/operations";
import { splitPoolIntoDays, resplitAll } from "@/lib/itinerary/split-trip";
import { createTrip } from "@/lib/trips/service";
import type { CreateTripData } from "@/lib/trips/schema";
import type { ComputedRoute } from "@/lib/routing/routes";

const prisma = new PrismaClient({
  adapter: new PrismaLibSql({ url: process.env.DATABASE_URL ?? "file:./test.db" }),
});

beforeEach(async () => {
  await prisma.poi.deleteMany();
  await prisma.day.deleteMany();
  await prisma.trip.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

// start (0,0) -> end (0,10), 2 days
function sampleTrip(dayCount = 2): CreateTripData {
  return {
    title: "T", description: "d", isRoundTrip: false, startDate: null, dayCount,
    start: { name: "S", lat: 0, lng: 0, placeId: null },
    end: { name: "E", lat: 0, lng: 10, placeId: null },
  };
}

// legs returned in route order [start->s0, s0->s1, ...]
function legRoute(legSeconds: number[]): ComputedRoute {
  return {
    encodedPolyline: "p",
    legs: legSeconds.map((s) => ({ durationSeconds: s, distanceMeters: 0 })),
    totalDurationSeconds: legSeconds.reduce((a, b) => a + b, 0),
    totalDistanceMeters: 0,
  };
}

describe("splitPoolIntoDays", () => {
  test("orders the pool by corridor and splits it across days by the cap", async () => {
    const trip = await createTrip(prisma, sampleTrip(2));
    // pool added out of order; corridor order by lng = A,B,C
    const c = await addPoi(prisma, trip.id, { name: "C", lat: 0, lng: 8 });
    const a = await addPoi(prisma, trip.id, { name: "A", lat: 0, lng: 2 });
    const b = await addPoi(prisma, trip.id, { name: "B", lat: 0, lng: 5 });
    // ordered A,B,C → legs [start->A, A->B, B->C] = [60,60,60]; cap 130 → day0 holds A+B
    // (60+60=120 ≤ 130), C tips over → day1. Assignment [0,0,1].
    await splitPoolIntoDays(prisma, trip.id, async () => legRoute([60, 60, 60]), 130);

    const fresh = await prisma.poi.findMany({ orderBy: [{ dayId: "asc" }, { orderInDay: "asc" }] });
    const dayOf = (id: string) => fresh.find((p) => p.id === id)!.dayId;
    expect(dayOf(a.id)).toBe(trip.days[0].id);
    expect(dayOf(b.id)).toBe(trip.days[0].id);
    expect(dayOf(c.id)).toBe(trip.days[1].id);
    // pool is now empty
    expect(fresh.every((p) => p.dayId !== null)).toBe(true);
  });

  test("appends pool stops before an existing overnight (overnight stays last)", async () => {
    const trip = await createTrip(prisma, sampleTrip(1));
    const over = await addPoi(prisma, trip.id, { name: "Hotel", lat: 0, lng: 9, dayId: trip.days[0].id });
    await setOvernight(prisma, over.id, true);
    const a = await addPoi(prisma, trip.id, { name: "A", lat: 0, lng: 2 });

    await splitPoolIntoDays(prisma, trip.id, async () => legRoute([60, 60]), 100000);

    const inDay = await prisma.poi.findMany({
      where: { dayId: trip.days[0].id },
      orderBy: { orderInDay: "asc" },
    });
    expect(inDay.map((p) => p.id)).toEqual([a.id, over.id]); // overnight last
  });

  test("does nothing when the pool is empty", async () => {
    const trip = await createTrip(prisma, sampleTrip(2));
    let called = false;
    await splitPoolIntoDays(prisma, trip.id, async () => {
      called = true;
      return legRoute([]);
    }, 100);
    expect(called).toBe(false);
  });
});

describe("resplitAll", () => {
  test("moves every assigned stop back to the pool, then splits everything", async () => {
    const trip = await createTrip(prisma, sampleTrip(2));
    // pre-place A in day 2 manually; B,C in pool
    const a = await addPoi(prisma, trip.id, { name: "A", lat: 0, lng: 2, dayId: trip.days[1].id });
    const b = await addPoi(prisma, trip.id, { name: "B", lat: 0, lng: 5 });
    const c = await addPoi(prisma, trip.id, { name: "C", lat: 0, lng: 8 });
    // after reset, corridor order A,B,C; legs [60,60,60]; cap 130 → [0,0,1]
    await resplitAll(prisma, trip.id, async () => legRoute([60, 60, 60]), 130);

    const fresh = await prisma.poi.findMany();
    const dayOf = (id: string) => fresh.find((p) => p.id === id)!.dayId;
    expect(dayOf(a.id)).toBe(trip.days[0].id); // A pulled back & re-split into day 0
    expect(dayOf(b.id)).toBe(trip.days[0].id);
    expect(dayOf(c.id)).toBe(trip.days[1].id);
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `bun run test`
Expected: split-trip suite fails (module not found); others pass.

- [ ] **Step 3: Implement `lib/itinerary/split-trip.ts`**

```ts
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { computeRoute, type ComputedRoute } from "@/lib/routing/routes";
import { orderByCorridor } from "@/lib/routing/corridor";
import { splitByDriveCap, DEFAULT_DAILY_DRIVE_MAX_SECONDS } from "@/lib/routing/split";

type ComputeRouteFn = (
  points: { lat: number; lng: number }[],
  apiKey?: string,
  opts?: { optimize?: boolean },
) => Promise<ComputedRoute>;

function dailyCapFromParams(params: string | null): number {
  if (!params) return DEFAULT_DAILY_DRIVE_MAX_SECONDS;
  try {
    const parsed = JSON.parse(params) as { dailyDriveMaxSeconds?: number };
    return typeof parsed.dailyDriveMaxSeconds === "number"
      ? parsed.dailyDriveMaxSeconds
      : DEFAULT_DAILY_DRIVE_MAX_SECONDS;
  } catch {
    return DEFAULT_DAILY_DRIVE_MAX_SECONDS;
  }
}

/**
 * Split the unassigned pool across the trip's days (corridor order + drive cap).
 * Existing day placements are kept; each pool stop is appended to its day before
 * that day's overnight (which stays last). `capOverride` is mainly for tests.
 */
export async function splitPoolIntoDays(
  prisma: PrismaClient,
  tripId: string,
  computeFn: ComputeRouteFn = computeRoute,
  capOverride?: number,
) {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: { days: { orderBy: { dayIndex: "asc" } }, pois: true },
  });
  if (!trip || trip.days.length === 0) return;

  const pool = trip.pois.filter((p) => p.dayId === null);
  if (pool.length === 0) return;

  const start = { lat: trip.startLat, lng: trip.startLng };
  const end =
    trip.endLat != null && trip.endLng != null
      ? { lat: trip.endLat, lng: trip.endLng }
      : start;

  const ordered = orderByCorridor(
    pool.map((p) => ({ id: p.id, lat: p.lat, lng: p.lng })),
    start,
    end,
  );

  const route = await computeFn([start, ...ordered.map((s) => ({ lat: s.lat, lng: s.lng })), end]);
  // leg i (start->ordered[0], ordered[0]->ordered[1], …) attributed to ordered[i]
  const legSeconds = ordered.map((_, i) => route.legs[i]?.durationSeconds ?? 0);

  const cap = capOverride ?? dailyCapFromParams(trip.params);
  const dayAssignment = splitByDriveCap(legSeconds, trip.days.length, cap);

  // group the newly-assigned pool stop ids by day index
  const newByDay = new Map<number, string[]>();
  ordered.forEach((s, i) => {
    const d = dayAssignment[i];
    const list = newByDay.get(d) ?? [];
    list.push(s.id);
    newByDay.set(d, list);
  });

  await prisma.$transaction(async (tx) => {
    for (let d = 0; d < trip.days.length; d++) {
      const newIds = newByDay.get(d) ?? [];
      if (newIds.length === 0) continue;
      const day = trip.days[d];
      const existing = trip.pois
        .filter((p) => p.dayId === day.id)
        .sort((a, b) => (a.orderInDay ?? 0) - (b.orderInDay ?? 0));
      const overnight = existing.filter((p) => p.isOvernight).map((p) => p.id);
      const others = existing.filter((p) => !p.isOvernight).map((p) => p.id);
      // others first, then newly-split stops, then the overnight (stays last)
      const finalIds = [...others, ...newIds, ...overnight];
      for (let i = 0; i < finalIds.length; i++) {
        await tx.poi.update({ where: { id: finalIds[i] }, data: { dayId: day.id, orderInDay: i } });
      }
    }
  });
}

/** Move every stop back to the pool, then build the split from scratch. */
export async function resplitAll(
  prisma: PrismaClient,
  tripId: string,
  computeFn: ComputeRouteFn = computeRoute,
  capOverride?: number,
) {
  await prisma.poi.updateMany({
    where: { tripId },
    data: { dayId: null, orderInDay: null, isOvernight: false },
  });
  await splitPoolIntoDays(prisma, tripId, computeFn, capOverride);
}
```

- [ ] **Step 4: Run and confirm pass**

Run: `bun run test`
Expected: all suites pass including the 4 split-trip cases.

- [ ] **Step 5: Commit**

```bash
git add lib/itinerary/split-trip.ts tests/itinerary/split-trip.test.ts
git commit -m "feat: add splitPoolIntoDays + resplitAll engine operations with tests"
```

---

## Task 4: Split + resplit API endpoints

**Files:** create `app/api/trips/[tripId]/split/route.ts`, `app/api/trips/[tripId]/resplit/route.ts`.

- [ ] **Step 1: Create `app/api/trips/[tripId]/split/route.ts`**

```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { splitPoolIntoDays } from "@/lib/itinerary/split-trip";
import { RouteError } from "@/lib/routing/routes";

type Ctx = { params: Promise<{ tripId: string }> };

export async function POST(_req: Request, { params }: Ctx) {
  const { tripId } = await params;
  try {
    await splitPoolIntoDays(prisma, tripId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof RouteError) {
      return NextResponse.json({ error: e.message }, { status: 502 });
    }
    throw e;
  }
}
```

- [ ] **Step 2: Create `app/api/trips/[tripId]/resplit/route.ts`**

```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resplitAll } from "@/lib/itinerary/split-trip";
import { RouteError } from "@/lib/routing/routes";

type Ctx = { params: Promise<{ tripId: string }> };

export async function POST(_req: Request, { params }: Ctx) {
  const { tripId } = await params;
  try {
    await resplitAll(prisma, tripId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof RouteError) {
      return NextResponse.json({ error: e.message }, { status: 502 });
    }
    throw e;
  }
}
```

- [ ] **Step 3: Verify build**

Run: `bun run build`
Expected: success; `ƒ /api/trips/[tripId]/split` and `ƒ /api/trips/[tripId]/resplit` listed.

- [ ] **Step 4: Commit**

```bash
git add app/api/trips/[tripId]/split app/api/trips/[tripId]/resplit
git commit -m "feat: add split + resplit API endpoints"
```

---

## Task 5: Client fetchers + hooks

**Files:** modify `lib/api/trips.ts`, `hooks/use-poi-mutations.ts`.

- [ ] **Step 1: Append to `lib/api/trips.ts`**

```ts
export async function buildSplitRequest(tripId: string): Promise<void> {
  const res = await fetch(`/api/trips/${tripId}/split`, { method: "POST" });
  if (!res.ok) throw new Error(`Failed to split into days (${res.status})`);
}

export async function resplitRequest(tripId: string): Promise<void> {
  const res = await fetch(`/api/trips/${tripId}/resplit`, { method: "POST" });
  if (!res.ok) throw new Error(`Failed to re-split (${res.status})`);
}
```

- [ ] **Step 2: Add hooks to `hooks/use-poi-mutations.ts`**

Add `buildSplitRequest` and `resplitRequest` to the existing import from `@/lib/api/trips`, then append:
```ts
export function useBuildSplit(tripId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => buildSplitRequest(tripId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: tripQueryKey(tripId) });
      qc.invalidateQueries({ queryKey: routeQueryKey(tripId) });
    },
  });
}

export function useResplit(tripId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => resplitRequest(tripId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: tripQueryKey(tripId) });
      qc.invalidateQueries({ queryKey: routeQueryKey(tripId) });
    },
  });
}
```

- [ ] **Step 3: Verify build**

Run: `bun run build`
Expected: success.

- [ ] **Step 4: Commit**

```bash
git add lib/api/trips.ts hooks/use-poi-mutations.ts
git commit -m "feat: add useBuildSplit + useResplit hooks"
```

---

## Task 6: Build + Re-split buttons in the planner

**Files:** modify `components/planner-shell.tsx`.

> Put a "Build route & split into days" button just above the pool (enabled when the pool has stops) and a "Re-split all" button next to it (enabled when any stop is assigned; confirms first since it discards manual placement). `assignedCount` = stops with a day.

- [ ] **Step 1: Modify `components/planner-shell.tsx`**

(a) Add the hooks to the existing import:
```tsx
import { useAddPoi, useMovePoi, useOptimizeDay, useBuildSplit, useResplit } from "@/hooks/use-poi-mutations";
```

(b) After `const optimizeDay = useOptimizeDay(tripId);`, add:
```tsx
  const buildSplit = useBuildSplit(tripId);
  const resplit = useResplit(tripId);
  const assignedCount = trip.pois.filter((p) => p.dayId !== null).length;
```

(c) Insert a button row directly BEFORE the "Unassigned places" block (i.e., before the `<div className="mb-4">` that contains `Unassigned places ({pool.length})`):
```tsx
            <div className="mb-3 flex gap-2">
              <Button
                size="sm"
                className="flex-1"
                disabled={pool.length === 0 || buildSplit.isPending}
                onClick={() => buildSplit.mutate()}
              >
                {buildSplit.isPending ? "Splitting…" : "Build route & split into days"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={assignedCount === 0 || resplit.isPending}
                onClick={() => {
                  if (
                    window.confirm(
                      "Re-split the whole trip? This moves every place back to the pool and rebuilds the days from scratch.",
                    )
                  ) {
                    resplit.mutate();
                  }
                }}
              >
                {resplit.isPending ? "Re-splitting…" : "Re-split all"}
              </Button>
            </div>
```

- [ ] **Step 2: Verify build + tests**

Run: `bun run build` (success) then `bun run test` (all pass). If the shadcn `Button` lacks an `"outline"` variant, use `variant="secondary"` instead (check `components/ui/button.tsx`).

- [ ] **Step 3: Commit**

```bash
git add components/planner-shell.tsx
git commit -m "feat: add Build route & split + Re-split all buttons"
```

---

## Task 7: Full verification

**Files:** none.

- [ ] **Step 1: Tests + build**

Run: `bun run test` (all pass incl. corridor, split, split-trip suites) and `bun run build` (success; `ƒ /api/trips/[tripId]/split` and `…/resplit` present).

- [ ] **Step 2: Manual smoke test** (dev server, real key, Routes API enabled)

Run `bun run dev`, open a multi-day trip, add several places to the **pool** (don't assign them), then:
1. Click **Build route & split into days** → the pool empties and the places distribute across the days in corridor order; the route line and per-day 🚗 times update; no day's driving wildly exceeds ~5 h unless a single leg forces it.
2. Add one more place to the pool and Build again → it's slotted into a day, existing day placements untouched.
3. Set an **overnight (🌙)** on a place in a day, add a pool place, Build → the new place lands in that day **before** the overnight (overnight stays last).
4. Click **Re-split all** → confirm the dialog → every place is pulled back and re-distributed from scratch.
5. The Build button is disabled when the pool is empty; Re-split is disabled when nothing is assigned.

Expected: all five. A 502 from the split endpoints means the Routes API isn't enabled for the key.

- [ ] **Step 3: Final commit (notes, if any)**

```bash
git add -A
git commit -m "docs: phase 2c verified" --allow-empty
```

---

## Phase 2c Done — Definition of Done

- `bun run test` passes (adds corridor, split, split-trip suites).
- `bun run build` succeeds with the split + resplit endpoints.
- "Build route & split into days" distributes the pool across days (corridor order, ~5 h cap, overnight stays last) keeping manual placements; "Re-split all" rebuilds from scratch after a confirm; both refresh the route + drive times.

**This completes the routing track (Phase 2).** Next: Phase 3 — AI draft & suggest (mode picker, `/api/ai/draft` + `/api/ai/suggest` resolving names → Places → the engine), then the dedicated design pass.
