# Phase 2b — Within-Day Waypoint Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-day "Optimize order" action that reorders a day's stops to minimize driving (via the Routes API's waypoint optimization), keeping the day's first stop as the start and its overnight (or last stop) as the end.

**Architecture:** Extend the existing `computeRoute` helper with an `optimize` option that returns the Routes API's optimized intermediate order. A pure `applyOptimizedOrder` helper reorders ids from that index array. A dependency-injected `optimizeDay` operation loads a day's stops, picks origin (first stop) and destination (overnight, else last stop), asks the Routes API to optimize the middle, and persists the new order transactionally. A `POST /api/days/[dayId]/optimize` endpoint, a `useOptimizeDay` mutation, and a per-day button wire it up.

**Tech Stack:** Next.js 16 + React 19, Prisma 7, Google Routes API (`computeRoutes` with `optimizeWaypointOrder`), TanStack Query v5, Zod-free (no new request body), Bun test runner.

---

## Context for the implementer (state after Phase 2a)

- `lib/routing/routes.ts` exports `computeRoute(points: LatLngLiteral[], apiKey?)` → `ComputedRoute { encodedPolyline, legs, totalDurationSeconds, totalDistanceMeters }`, plus `RouteError`, `LatLngLiteral`, `RouteLeg`, `ComputedRoute`. It builds the request with `points[0]` = origin, last = destination, middle = intermediates, and parses durations like `"123s"`.
- `lib/itinerary/operations.ts` exports `ItineraryError`, `addPoi`, `removePoi`, `movePoi`, `setOvernight` (all take a `PrismaClient`). Prisma interactive `$transaction(async (tx) => …)` works with the libSQL adapter. Generated client is `@/lib/generated/prisma/client`.
- `lib/trips/service.ts` `getTrip` returns days with nested ordered pois. `Poi` has `id, dayId, orderInDay, isOvernight, lat, lng, name`.
- `hooks/use-trip.ts` → `tripQueryKey(tripId)`. `hooks/use-route.ts` → `routeQueryKey(tripId)`, `useRoute(tripId)`. `hooks/use-poi-mutations.ts` mutations already invalidate both `tripQueryKey` and `routeQueryKey`.
- `components/planner-shell.tsx` renders each day with a header `<div className="mb-2 flex items-center justify-between text-sm font-medium"><span>Day {day.dayIndex + 1}</span>{route?.perDaySeconds[day.id] ? (<span …>🚗 {formatDuration(...)}</span>) : null}</div>` followed by a `<PoiContainer>`. It has `useTrip`, `useRoute`, `useAddPoi`, `useMovePoi`.
- DB-backed tests run via `bun run test`; they instantiate a `PrismaClient` with `new PrismaLibSql({ url: process.env.DATABASE_URL ?? "file:./test.db" })`. Git identity configured; NO AI co-author trailer.

**Routes API optimization:** add `optimizeWaypointOrder: true` to the request body and `routes.optimizedIntermediateWaypointIndex` to the `X-Goog-FieldMask`. The response's `routes[0].optimizedIntermediateWaypointIndex` is an array where position `i` holds the **original index** (into the request's `intermediates` array) of the waypoint that should be visited `i`-th.

---

## File Structure

```
lib/routing/routes.ts                       (MODIFY) computeRoute gains an { optimize } option + optimizedOrder
lib/routing/optimize.ts                     (CREATE) pure applyOptimizedOrder(items, optimizedIndices)
lib/itinerary/operations.ts                 (MODIFY) optimizeDay(prisma, dayId, computeFn?)
app/api/days/[dayId]/optimize/route.ts      (CREATE) POST: optimize a day's order
lib/api/trips.ts                            (MODIFY) add optimizeDayRequest fetcher
hooks/use-poi-mutations.ts                  (MODIFY) add useOptimizeDay (invalidate trip + route)
components/planner-shell.tsx                (MODIFY) per-day "Optimize" button
tests/routing/routes.test.ts                (MODIFY) optimize case
tests/routing/optimize.test.ts              (CREATE)
tests/itinerary/optimize-day.test.ts        (CREATE)
```

---

## Task 1: `computeRoute` optimize option — TDD

**Files:** modify `lib/routing/routes.ts`, `tests/routing/routes.test.ts`.

- [ ] **Step 1: Add a failing test** — append to `tests/routing/routes.test.ts` (inside the existing `describe("computeRoute", …)` block, before its closing `});`):

```ts
  test("requests optimization and returns the optimized intermediate order", async () => {
    let captured: { body: string } | null = null;
    globalThis.fetch = (async (_url: string, init: RequestInit) => {
      captured = { body: String(init.body) };
      return {
        ok: true,
        status: 200,
        json: async () => ({
          routes: [
            {
              duration: "100s",
              distanceMeters: 1000,
              polyline: { encodedPolyline: "p" },
              legs: [{ duration: "100s", distanceMeters: 1000 }],
              optimizedIntermediateWaypointIndex: [1, 0],
            },
          ],
        }),
      } as Response;
    }) as typeof fetch;

    const r = await computeRoute(
      [
        { lat: 0, lng: 0 },
        { lat: 1, lng: 1 },
        { lat: 2, lng: 2 },
        { lat: 3, lng: 3 },
      ],
      "fake-key",
      { optimize: true },
    );
    expect(r.optimizedOrder).toEqual([1, 0]);
    expect(captured!.body).toContain("\"optimizeWaypointOrder\":true");
  });
```

- [ ] **Step 2: Run and confirm failure**

Run: `bun test tests/routing/routes.test.ts`
Expected: FAIL — `optimizedOrder` is undefined / `optimizeWaypointOrder` not in body.

- [ ] **Step 3: Modify `lib/routing/routes.ts`**

(a) Add `optimizedOrder` to the `ComputedRoute` type:
```ts
export type ComputedRoute = {
  encodedPolyline: string;
  legs: RouteLeg[];
  totalDurationSeconds: number;
  totalDistanceMeters: number;
  optimizedOrder?: number[];
};
```

(b) Change the `computeRoute` signature to accept options:
```ts
export async function computeRoute(
  points: LatLngLiteral[],
  apiKey: string | undefined = process.env.GOOGLE_MAPS_SERVER_KEY,
  opts: { optimize?: boolean } = {},
): Promise<ComputedRoute> {
```

(c) In the `fetch` call, make the FieldMask and body depend on `opts.optimize`. Replace the existing `headers`/`body` with:
```ts
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": [
        "routes.duration",
        "routes.distanceMeters",
        "routes.polyline.encodedPolyline",
        "routes.legs.duration",
        "routes.legs.distanceMeters",
        ...(opts.optimize ? ["routes.optimizedIntermediateWaypointIndex"] : []),
      ].join(","),
    },
    body: JSON.stringify({
      origin: toWaypoint(origin),
      destination: toWaypoint(destination),
      intermediates: intermediates.map(toWaypoint),
      travelMode: "DRIVE",
      units: "METRIC",
      ...(opts.optimize ? { optimizeWaypointOrder: true } : {}),
    }),
```

(d) Parse the optimized index in the response type and return value. Extend the response cast to include the field and add it to the returned object:
```ts
  const data = (await res.json()) as {
    routes?: Array<{
      duration?: string;
      distanceMeters?: number;
      polyline?: { encodedPolyline?: string };
      legs?: Array<{ duration?: string; distanceMeters?: number }>;
      optimizedIntermediateWaypointIndex?: number[];
    }>;
  };
```
and in the returned object add:
```ts
    optimizedOrder: route.optimizedIntermediateWaypointIndex,
```

- [ ] **Step 4: Run and confirm pass**

Run: `bun test tests/routing/routes.test.ts`
Expected: PASS (all prior cases + the new one).

- [ ] **Step 5: Commit**

```bash
git add lib/routing/routes.ts tests/routing/routes.test.ts
git commit -m "feat: add waypoint-optimization option to computeRoute"
```

---

## Task 2: Pure `applyOptimizedOrder` — TDD

**Files:** create `lib/routing/optimize.ts`; test `tests/routing/optimize.test.ts`.

- [ ] **Step 1: Write the failing test** `tests/routing/optimize.test.ts`:

```ts
import { test, expect, describe } from "bun:test";
import { applyOptimizedOrder } from "@/lib/routing/optimize";

describe("applyOptimizedOrder", () => {
  test("reorders items by the optimized index array", () => {
    expect(applyOptimizedOrder(["a", "b", "c"], [2, 0, 1])).toEqual(["c", "a", "b"]);
  });

  test("returns items unchanged when indices length mismatches", () => {
    const items = ["a", "b", "c"];
    expect(applyOptimizedOrder(items, [0, 1])).toEqual(["a", "b", "c"]);
  });

  test("returns items unchanged when indices are out of range", () => {
    const items = ["a", "b"];
    expect(applyOptimizedOrder(items, [0, 5])).toEqual(["a", "b"]);
  });

  test("handles an empty list", () => {
    expect(applyOptimizedOrder([], [])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `bun test tests/routing/optimize.test.ts`
Expected: FAIL — cannot resolve `@/lib/routing/optimize`.

- [ ] **Step 3: Implement `lib/routing/optimize.ts`**

```ts
/**
 * Reorder `items` according to `optimizedIndices`, where position i holds the
 * original index of the item that should be at position i. Returns the input
 * unchanged if the indices don't form a valid permutation of the items.
 */
export function applyOptimizedOrder<T>(items: T[], optimizedIndices: number[]): T[] {
  if (optimizedIndices.length !== items.length) return items;
  const valid = optimizedIndices.every((i) => Number.isInteger(i) && i >= 0 && i < items.length);
  if (!valid) return items;
  return optimizedIndices.map((i) => items[i]);
}
```

- [ ] **Step 4: Run and confirm pass**

Run: `bun test tests/routing/optimize.test.ts`
Expected: PASS (4 cases).

- [ ] **Step 5: Commit**

```bash
git add lib/routing/optimize.ts tests/routing/optimize.test.ts
git commit -m "feat: add pure applyOptimizedOrder helper with tests"
```

---

## Task 3: `optimizeDay` operation — TDD

**Files:** modify `lib/itinerary/operations.ts`; test `tests/itinerary/optimize-day.test.ts`.

> `optimizeDay` takes an injectable `computeFn` (defaulting to the real `computeRoute`) so tests run without the network. Origin = the day's first stop; destination = the overnight stop if the day has one, else the last stop; the middle stops are optimized.

- [ ] **Step 1: Write the failing test** `tests/itinerary/optimize-day.test.ts`:

```ts
import { test, expect, describe, beforeEach, afterAll } from "bun:test";
import { PrismaClient } from "@/lib/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { addPoi, setOvernight, optimizeDay } from "@/lib/itinerary/operations";
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

function sampleTrip(): CreateTripData {
  return {
    title: "T", description: "d", isRoundTrip: false, startDate: null, dayCount: 1,
    start: { name: "S", lat: 0, lng: 0, placeId: null },
    end: { name: "E", lat: 9, lng: 9, placeId: null },
  };
}

function fakeRoute(optimizedOrder?: number[]): ComputedRoute {
  return {
    encodedPolyline: "p",
    legs: [],
    totalDurationSeconds: 0,
    totalDistanceMeters: 0,
    optimizedOrder,
  };
}

describe("optimizeDay", () => {
  test("reorders the middle stops per the optimized order (origin & last fixed)", async () => {
    const trip = await createTrip(prisma, sampleTrip());
    const dayId = trip.days[0].id;
    const a = await addPoi(prisma, trip.id, { name: "A", lat: 1, lng: 1, dayId });
    const b = await addPoi(prisma, trip.id, { name: "B", lat: 2, lng: 2, dayId });
    const c = await addPoi(prisma, trip.id, { name: "C", lat: 3, lng: 3, dayId });
    const d = await addPoi(prisma, trip.id, { name: "D", lat: 4, lng: 4, dayId });
    // intermediates are [B, C]; optimized order [1,0] => [C, B]
    await optimizeDay(prisma, dayId, async () => fakeRoute([1, 0]));

    const inDay = await prisma.poi.findMany({ where: { dayId }, orderBy: { orderInDay: "asc" } });
    expect(inDay.map((p) => p.id)).toEqual([a.id, c.id, b.id, d.id]);
  });

  test("uses the overnight stop as the fixed destination", async () => {
    const trip = await createTrip(prisma, sampleTrip());
    const dayId = trip.days[0].id;
    const a = await addPoi(prisma, trip.id, { name: "A", lat: 1, lng: 1, dayId });
    const b = await addPoi(prisma, trip.id, { name: "B", lat: 2, lng: 2, dayId });
    const c = await addPoi(prisma, trip.id, { name: "C", lat: 3, lng: 3, dayId });
    const d = await addPoi(prisma, trip.id, { name: "D", lat: 4, lng: 4, dayId });
    await setOvernight(prisma, b.id, true); // B is where you sleep → must end the day

    // origin = A (first non-destination), destination = B, intermediates = [C, D]
    await optimizeDay(prisma, dayId, async () => fakeRoute([1, 0])); // [D, C]

    const inDay = await prisma.poi.findMany({ where: { dayId }, orderBy: { orderInDay: "asc" } });
    expect(inDay.map((p) => p.id)).toEqual([a.id, d.id, c.id, b.id]);
  });

  test("is a no-op for fewer than 3 stops (computeFn not called)", async () => {
    const trip = await createTrip(prisma, sampleTrip());
    const dayId = trip.days[0].id;
    const a = await addPoi(prisma, trip.id, { name: "A", lat: 1, lng: 1, dayId });
    const b = await addPoi(prisma, trip.id, { name: "B", lat: 2, lng: 2, dayId });
    let called = false;
    await optimizeDay(prisma, dayId, async () => {
      called = true;
      return fakeRoute([]);
    });
    expect(called).toBe(false);
    const inDay = await prisma.poi.findMany({ where: { dayId }, orderBy: { orderInDay: "asc" } });
    expect(inDay.map((p) => p.id)).toEqual([a.id, b.id]);
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `bun run test`
Expected: optimize-day suite fails (`optimizeDay` not exported); others pass.

- [ ] **Step 3: Implement `optimizeDay`** — append to `lib/itinerary/operations.ts`. Add these imports at the top of the file (next to the existing `import type { PrismaClient } …`):
```ts
import { computeRoute, type ComputedRoute } from "@/lib/routing/routes";
import { applyOptimizedOrder } from "@/lib/routing/optimize";
```
Then append:
```ts
type ComputeRouteFn = (
  points: { lat: number; lng: number }[],
  apiKey?: string,
  opts?: { optimize?: boolean },
) => Promise<ComputedRoute>;

export async function optimizeDay(
  prisma: PrismaClient,
  dayId: string,
  computeFn: ComputeRouteFn = computeRoute,
) {
  const stops = await prisma.poi.findMany({
    where: { dayId },
    orderBy: { orderInDay: "asc" },
  });
  // Need origin + at least one intermediate + destination to optimize anything.
  if (stops.length < 3) return stops;

  const destination = stops.find((s) => s.isOvernight) ?? stops[stops.length - 1];
  const rest = stops.filter((s) => s.id !== destination.id);
  const origin = rest[0];
  const intermediates = rest.slice(1);
  if (intermediates.length < 1) return stops;

  const points = [origin, ...intermediates, destination].map((s) => ({ lat: s.lat, lng: s.lng }));
  const route = await computeFn(points, undefined, { optimize: true });

  const orderedIntermediates =
    route.optimizedOrder && route.optimizedOrder.length === intermediates.length
      ? applyOptimizedOrder(intermediates, route.optimizedOrder)
      : intermediates;

  const finalOrder = [origin, ...orderedIntermediates, destination];

  return prisma.$transaction(async (tx) => {
    for (let i = 0; i < finalOrder.length; i++) {
      await tx.poi.update({ where: { id: finalOrder[i].id }, data: { orderInDay: i } });
    }
    return tx.poi.findMany({ where: { dayId }, orderBy: { orderInDay: "asc" } });
  });
}
```

- [ ] **Step 4: Run and confirm pass**

Run: `bun run test`
Expected: all suites pass including the 3 optimize-day cases.

- [ ] **Step 5: Commit**

```bash
git add lib/itinerary/operations.ts tests/itinerary/optimize-day.test.ts
git commit -m "feat: add optimizeDay operation (overnight-anchored) with tests"
```

---

## Task 4: Optimize API endpoint

**Files:** create `app/api/days/[dayId]/optimize/route.ts`.

- [ ] **Step 1: Create `app/api/days/[dayId]/optimize/route.ts`**

```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { optimizeDay, ItineraryError } from "@/lib/itinerary/operations";
import { RouteError } from "@/lib/routing/routes";

type Ctx = { params: Promise<{ dayId: string }> };

export async function POST(_req: Request, { params }: Ctx) {
  const { dayId } = await params;
  try {
    const pois = await optimizeDay(prisma, dayId);
    return NextResponse.json({ ok: true, count: pois.length });
  } catch (e) {
    if (e instanceof ItineraryError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    if (e instanceof RouteError) {
      return NextResponse.json({ error: e.message }, { status: 502 });
    }
    throw e;
  }
}
```

- [ ] **Step 2: Verify build**

Run: `bun run build`
Expected: success; `ƒ /api/days/[dayId]/optimize` listed.

- [ ] **Step 3: Commit**

```bash
git add app/api/days/[dayId]/optimize
git commit -m "feat: add POST /api/days/[dayId]/optimize route"
```

---

## Task 5: Client fetcher + useOptimizeDay hook

**Files:** modify `lib/api/trips.ts`, `hooks/use-poi-mutations.ts`.

- [ ] **Step 1: Append the fetcher to `lib/api/trips.ts`**

```ts
export async function optimizeDayRequest(dayId: string): Promise<void> {
  const res = await fetch(`/api/days/${dayId}/optimize`, { method: "POST" });
  if (!res.ok) throw new Error(`Failed to optimize day (${res.status})`);
}
```

- [ ] **Step 2: Add the hook to `hooks/use-poi-mutations.ts`**

Add `optimizeDayRequest` to the existing import from `@/lib/api/trips`:
```ts
import {
  postPoi,
  deletePoi,
  patchPoiMove,
  patchPoiOvernight,
  optimizeDayRequest,
  type TripDetail,
} from "@/lib/api/trips";
```
Append this hook (alongside the others; `routeQueryKey` and `tripQueryKey` are already imported):
```ts
export function useOptimizeDay(tripId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dayId: string) => optimizeDayRequest(dayId),
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
git commit -m "feat: add useOptimizeDay mutation hook"
```

---

## Task 6: Per-day "Optimize" button

**Files:** modify `components/planner-shell.tsx`.

> Add an "Optimize" button to each day header (next to the drive-time chip). It's only useful with 3+ stops, so only render it then. Use the existing `Button` (already imported) with `variant="ghost"`/`size="sm"`.

- [ ] **Step 1: Modify `components/planner-shell.tsx`**

(a) Add the hook import alongside the others:
```tsx
import { useAddPoi, useMovePoi, useOptimizeDay } from "@/hooks/use-poi-mutations";
```

(b) Inside `PlannerShell`, after the `const movePoi = useMovePoi(tripId);` line, add:
```tsx
  const optimizeDay = useOptimizeDay(tripId);
```

(c) Replace the day header block:
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
with:
```tsx
                  <div className="mb-2 flex items-center justify-between gap-2 text-sm font-medium">
                    <span>Day {day.dayIndex + 1}</span>
                    <span className="flex items-center gap-2">
                      {route?.perDaySeconds[day.id] ? (
                        <span className="text-xs font-normal text-muted-foreground">
                          🚗 {formatDuration(route.perDaySeconds[day.id])}
                        </span>
                      ) : null}
                      {byDay(day.id).length >= 3 ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-xs font-normal"
                          disabled={optimizeDay.isPending}
                          onClick={() => optimizeDay.mutate(day.id)}
                          aria-label={`Optimize order of day ${day.dayIndex + 1}`}
                        >
                          {optimizeDay.isPending && optimizeDay.variables === day.id
                            ? "Optimizing…"
                            : "Optimize"}
                        </Button>
                      ) : null}
                    </span>
                  </div>
```

- [ ] **Step 2: Verify build + tests**

Run: `bun run build` (success) then `bun run test` (all pass).

- [ ] **Step 3: Commit**

```bash
git add components/planner-shell.tsx
git commit -m "feat: add per-day Optimize order button"
```

---

## Task 7: Full verification

**Files:** none.

- [ ] **Step 1: Tests + build**

Run: `bun run test` (all pass, incl. routes optimize + optimize helper + optimize-day suites) and `bun run build` (success; `ƒ /api/days/[dayId]/optimize` present).

- [ ] **Step 2: Manual smoke test** (dev server, real key with **Routes API** enabled)

Run `bun run dev`, open a trip, put **3+ places into one day in a deliberately bad order** (e.g., zig-zag), then:
1. The day header shows an **Optimize** button (only for days with 3+ stops).
2. Click it → after a moment the day's stops reorder to a more efficient sequence, the route line redraws, and the day's 🚗 drive time drops (or stays equal if already optimal).
3. If the day has an **overnight (🌙)** stop, it remains **last** after optimizing.
4. A day with 2 or fewer stops shows **no** Optimize button.

Expected: all four. If clicking returns an error, confirm the Routes API is enabled for `GOOGLE_MAPS_SERVER_KEY` (a 502 surfaces as a failed mutation).

- [ ] **Step 3: Final commit (notes, if any)**

```bash
git add -A
git commit -m "docs: phase 2b verified" --allow-empty
```

---

## Phase 2b Done — Definition of Done

- `bun run test` passes (adds routes-optimize, applyOptimizedOrder, optimizeDay suites).
- `bun run build` succeeds with the new optimize endpoint.
- Each day with 3+ stops has an Optimize button that reorders its stops for less driving, keeps the overnight last, and refreshes the route + drive times.

**Next:** draggable route via-points (`RouteVia` model + route-builder/computeRoute via-support + map editing), then Phase 2c — the day-split engine ("Build route & split into days" / Re-split, pool-only, corridor-projection ordering, overnight-anchored + drive-cap).
