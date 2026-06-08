# Draggable Route Via-Points Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user bend the driving route onto preferred roads with via-points — click a route leg to drop one, drag it onto a road, double-click to remove — without it becoming a stop or affecting drive-time attribution.

**Architecture:** A `RouteVia` model (anchored to the stop it follows via a nullable `afterPoiId` string). The route builder inserts vias as Google Routes API `via:true` (non-stopover) intermediates after their anchor stop, so legs stay stop-to-stop and per-day/total drive time is unaffected. The map renders the route as per-leg clickable polylines (clicking a leg yields its anchor stop) and draggable diamond markers for vias.

**Tech Stack:** Next.js 16 + React 19, Prisma 7 (libSQL), Google Routes API, TanStack Query v5, `@vis.gl/react-google-maps`, Bun test runner.

---

## Context for the implementer (current state)

- `lib/routing/routes.ts` exports `computeRoute(points: LatLngLiteral[], apiKey?, opts: { optimize?: boolean } = {})` → `ComputedRoute { encodedPolyline, legs: { durationSeconds, distanceMeters }[], totalDurationSeconds, totalDistanceMeters, optimizedOrder? }`, plus `LatLngLiteral`, `RouteError`. It splits `points` into origin (first), destination (last), intermediates (middle, all stopovers); FieldMask + body conditionally add optimize fields; parses durations like `"123s"`.
- `lib/routing/itinerary-route.ts` exports `orderedRoutePoints(trip)` → `{ coords, legDayId }` and `attributeLegDurations(legDayId, legSeconds)` → `{ perDaySeconds, totalSeconds }`.
- `app/api/trips/[tripId]/route/route.ts` GET: `getTrip` → `orderedRoutePoints` → `computeRoute(coords)` → returns `{ encodedPolyline, perDaySeconds, totalSeconds, totalMeters }`.
- `lib/api/trips.ts`: `RouteResult { encodedPolyline: string | null; perDaySeconds; totalSeconds; totalMeters }`, `fetchRoute`; `TripDetail` (has `days`, `pois`, `poiGroups`), `PoiDetail`, `DayDetail`. `hooks/use-route.ts` → `routeQueryKey`, `useRoute`.
- `lib/itinerary/operations.ts` exports `ItineraryError` and many ops. `lib/trips/service.ts` `getTrip` includes `days`, `pois`, `poiGroups`.
- `components/trip-map.tsx` (client) renders pins + a single route polyline via an internal `RoutePolyline({ path, encoded })` (decodes `encoded` with `useMapsLibrary("geometry")`), takes prop `routePolyline?: string | null`. `components/planner-shell.tsx` passes `routePolyline={route?.encodedPolyline ?? null}` and wraps the day columns in their own `DragDropProvider`.
- Prisma generated client at `@/lib/generated/prisma/client`; libSQL; interactive `$transaction` works; DB tests via `bun run test`. Git identity configured; NO AI co-author trailer.

---

## File Structure

```
prisma/schema.prisma                 (MODIFY) RouteVia model + Trip.routeVias
lib/itinerary/operations.ts          (MODIFY) addVia / moveVia / removeVia
lib/routing/routes.ts                (MODIFY) RouteWaypoint (via flag); opts.legPolylines; legs[].encodedPolyline
lib/routing/itinerary-route.ts       (MODIFY) buildRoute (waypoints w/ vias, legDayId, legAfterPoiId) + TripVia type
app/api/trips/[tripId]/route/route.ts(MODIFY) use buildRoute; return per-leg legs[]
app/api/trips/[tripId]/vias/route.ts (CREATE) POST addVia
app/api/vias/[viaId]/route.ts        (CREATE) PATCH moveVia, DELETE removeVia
lib/itinerary/schema.ts              (MODIFY) addViaSchema, moveViaSchema
lib/trips/service.ts                 (MODIFY) getTrip includes routeVias
lib/api/trips.ts                     (MODIFY) RouteResult.legs; TripDetail.routeVias; via fetchers
hooks/use-via-mutations.ts           (CREATE) useAddVia / useMoveVia / useRemoveVia
components/trip-map.tsx              (MODIFY) per-leg clickable polylines + draggable via diamonds
components/planner-shell.tsx         (MODIFY) pass legs + routeVias + via handlers to TripMap
tests/itinerary/via.test.ts          (CREATE)
tests/routing/routes.test.ts         (MODIFY) via-flag + legPolylines cases
tests/routing/build-route.test.ts    (CREATE)
```

---

## Task 1: RouteVia schema

**Files:** modify `prisma/schema.prisma`.

- [ ] **Step 1: Edit `prisma/schema.prisma`** — add the back-relation to `Trip` and the new model.

Add to the `Trip` model (alongside `days`/`pois`/`poiGroups`):
```prisma
  routeVias RouteVia[]
```
Add the model:
```prisma
model RouteVia {
  id         String   @id @default(cuid())
  tripId     String
  trip       Trip     @relation(fields: [tripId], references: [id], onDelete: Cascade)
  afterPoiId String?
  lat        Float
  lng        Float
  seq        Int
  createdAt  DateTime @default(now())
}
```
> `afterPoiId` is a plain nullable column (NOT a relation to `Poi`) so unscheduling/deleting a stop never cascades to vias — the route builder skips orphans instead.

- [ ] **Step 2: Push + confirm**

Run: `bunx prisma db push` then `sqlite3 dev.db ".tables"` (note: the live DB is the project-root `dev.db`). Expected: `RouteVia` listed; client regenerated.

- [ ] **Step 3: Build**

Run: `bun run build`
Expected: success.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat: add RouteVia model"
```

---

## Task 2: Via operations — TDD

**Files:** modify `lib/itinerary/operations.ts`; test `tests/itinerary/via.test.ts`.

- [ ] **Step 1: Write the failing test** `tests/itinerary/via.test.ts`:

```ts
import { test, expect, describe, beforeEach, afterAll } from "bun:test";
import { PrismaClient } from "@/lib/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { addVia, moveVia, removeVia, addPoi, ItineraryError } from "@/lib/itinerary/operations";
import { createTrip } from "@/lib/trips/service";
import type { CreateTripData } from "@/lib/trips/schema";

const prisma = new PrismaClient({
  adapter: new PrismaLibSql({ url: process.env.DATABASE_URL ?? "file:./test.db" }),
});

beforeEach(async () => {
  await prisma.routeVia.deleteMany();
  await prisma.poi.deleteMany();
  await prisma.poiGroup.deleteMany();
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
    end: { name: "E", lat: 1, lng: 1, placeId: null },
  };
}

describe("via operations", () => {
  test("addVia with null anchor sets sequential seq", async () => {
    const trip = await createTrip(prisma, sampleTrip());
    const v0 = await addVia(prisma, trip.id, { afterPoiId: null, lat: 0.5, lng: 0.5 });
    const v1 = await addVia(prisma, trip.id, { afterPoiId: null, lat: 0.6, lng: 0.6 });
    expect(v0.afterPoiId).toBeNull();
    expect(v0.seq).toBe(0);
    expect(v1.seq).toBe(1);
  });

  test("addVia anchored to a stop validates the stop belongs to the trip", async () => {
    const trip = await createTrip(prisma, sampleTrip());
    const stop = await addPoi(prisma, trip.id, { name: "A", lat: 0.2, lng: 0.2, dayId: trip.days[0].id });
    const v = await addVia(prisma, trip.id, { afterPoiId: stop.id, lat: 0.3, lng: 0.3 });
    expect(v.afterPoiId).toBe(stop.id);
    expect(v.seq).toBe(0);
  });

  test("addVia rejects an anchor stop from a different trip", async () => {
    const tripA = await createTrip(prisma, sampleTrip());
    const tripB = await createTrip(prisma, sampleTrip());
    const stopB = await addPoi(prisma, tripB.id, { name: "B", lat: 0.2, lng: 0.2, dayId: tripB.days[0].id });
    await expect(
      addVia(prisma, tripA.id, { afterPoiId: stopB.id, lat: 0.3, lng: 0.3 }),
    ).rejects.toBeInstanceOf(ItineraryError);
  });

  test("moveVia updates coordinates", async () => {
    const trip = await createTrip(prisma, sampleTrip());
    const v = await addVia(prisma, trip.id, { afterPoiId: null, lat: 0.5, lng: 0.5 });
    const m = await moveVia(prisma, v.id, { lat: 0.9, lng: 0.8 });
    expect(m.lat).toBeCloseTo(0.9);
    expect(m.lng).toBeCloseTo(0.8);
  });

  test("removeVia deletes it", async () => {
    const trip = await createTrip(prisma, sampleTrip());
    const v = await addVia(prisma, trip.id, { afterPoiId: null, lat: 0.5, lng: 0.5 });
    await removeVia(prisma, v.id);
    expect(await prisma.routeVia.count()).toBe(0);
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `bun run test`
Expected: via suite fails (exports missing).

- [ ] **Step 3: Implement** — append to `lib/itinerary/operations.ts`:

```ts
export async function addVia(
  prisma: PrismaClient,
  tripId: string,
  input: { afterPoiId: string | null; lat: number; lng: number },
) {
  if (input.afterPoiId) {
    const stop = await prisma.poi.findFirst({ where: { id: input.afterPoiId, tripId } });
    if (!stop) throw new ItineraryError("Anchor stop does not belong to this trip");
  }
  const seq = await prisma.routeVia.count({
    where: { tripId, afterPoiId: input.afterPoiId ?? null },
  });
  return prisma.routeVia.create({
    data: { tripId, afterPoiId: input.afterPoiId ?? null, lat: input.lat, lng: input.lng, seq },
  });
}

export async function moveVia(
  prisma: PrismaClient,
  viaId: string,
  input: { lat: number; lng: number },
) {
  return prisma.routeVia.update({ where: { id: viaId }, data: { lat: input.lat, lng: input.lng } });
}

export async function removeVia(prisma: PrismaClient, viaId: string) {
  return prisma.routeVia.delete({ where: { id: viaId } });
}
```

- [ ] **Step 4: Run and confirm pass**

Run: `bun run test`
Expected: all pass including the 5 via cases.

- [ ] **Step 5: Commit**

```bash
git add lib/itinerary/operations.ts tests/itinerary/via.test.ts
git commit -m "feat: add via operations (add/move/remove) with tests"
```

---

## Task 3: `computeRoute` via-flag + leg polylines — TDD

**Files:** modify `lib/routing/routes.ts`, `tests/routing/routes.test.ts`.

- [ ] **Step 1: Add failing tests** — append inside the `describe("computeRoute", …)` block in `tests/routing/routes.test.ts`:

```ts
  test("marks via intermediates as via:true and requests leg polylines", async () => {
    let body = "";
    let fieldMask = "";
    globalThis.fetch = (async (_url: string, init: RequestInit) => {
      body = String(init.body);
      fieldMask = (init.headers as Record<string, string>)["X-Goog-FieldMask"];
      return {
        ok: true,
        status: 200,
        json: async () => ({
          routes: [
            {
              duration: "100s",
              distanceMeters: 1000,
              polyline: { encodedPolyline: "p" },
              legs: [
                { duration: "100s", distanceMeters: 1000, polyline: { encodedPolyline: "leg0" } },
              ],
            },
          ],
        }),
      } as Response;
    }) as typeof fetch;

    const r = await computeRoute(
      [
        { lat: 0, lng: 0 },
        { lat: 1, lng: 1, via: true },
        { lat: 2, lng: 2 },
      ],
      "fake-key",
      { legPolylines: true },
    );
    expect(body).toContain("\"via\":true");
    expect(fieldMask).toContain("routes.legs.polyline.encodedPolyline");
    expect(r.legs[0].encodedPolyline).toBe("leg0");
  });
```

- [ ] **Step 2: Run and confirm failure**

Run: `bun test tests/routing/routes.test.ts`
Expected: FAIL — no `via` in body / no leg polyline.

- [ ] **Step 3: Implement** — in `lib/routing/routes.ts`:

(a) Add a waypoint type and use it for `points`:
```ts
export type RouteWaypoint = { lat: number; lng: number; via?: boolean };
```
Change `computeRoute(points: LatLngLiteral[], …)` to `computeRoute(points: RouteWaypoint[], …)`. (`LatLngLiteral[]` is assignable, so existing callers are unaffected.)

(b) Add `legPolylines` to opts:
```ts
  opts: { optimize?: boolean; legPolylines?: boolean } = {},
```

(c) Change intermediates building so via waypoints carry `via: true` (omit when false to keep existing requests byte-identical). Replace `intermediates: intermediates.map(toWaypoint),` in the body with:
```ts
      intermediates: intermediates.map((p) =>
        p.via ? { ...toWaypoint(p), via: true } : toWaypoint(p),
      ),
```

(d) Add the leg-polyline field to the FieldMask array conditionally:
```ts
        ...(opts.legPolylines ? ["routes.legs.polyline.encodedPolyline"] : []),
```

(e) Extend `ComputedRoute['legs']` items with `encodedPolyline?: string`, the response cast's legs with `polyline?: { encodedPolyline?: string }`, and the returned legs map:
```ts
    legs: (route.legs ?? []).map((l) => ({
      durationSeconds: parseSeconds(l.duration),
      distanceMeters: l.distanceMeters ?? 0,
      encodedPolyline: l.polyline?.encodedPolyline,
    })),
```

- [ ] **Step 4: Run and confirm pass**

Run: `bun test tests/routing/routes.test.ts`
Expected: PASS (all prior + the new one).

- [ ] **Step 5: Commit**

```bash
git add lib/routing/routes.ts tests/routing/routes.test.ts
git commit -m "feat: computeRoute supports via waypoints and leg polylines"
```

---

## Task 4: `buildRoute` (vias + per-leg anchors) — TDD

**Files:** modify `lib/routing/itinerary-route.ts`; test `tests/routing/build-route.test.ts`.

- [ ] **Step 1: Write the failing test** `tests/routing/build-route.test.ts`:

```ts
import { test, expect, describe } from "bun:test";
import { buildRoute, type TripVia } from "@/lib/routing/itinerary-route";
import type { TripDetail, PoiDetail } from "@/lib/api/trips";

function poi(id: string, dayId: string | null, orderInDay: number | null, lat: number, lng: number): PoiDetail {
  return {
    id, name: id, lat, lng, placeId: null, category: null, source: "user",
    isOvernight: false, dayId, orderInDay, status: "accepted", groupId: null, orderInGroup: null,
  };
}

function trip(pois: PoiDetail[]): TripDetail {
  return {
    id: "t", title: "T", description: "",
    startName: "S", startLat: 0, startLng: 0,
    endName: "E", endLat: 0, endLng: 10, isRoundTrip: false,
    days: [{ id: "d1", dayIndex: 0, pois: [] }],
    pois, poiGroups: [],
  };
}

describe("buildRoute", () => {
  test("inserts a via after its anchor stop as via:true; legs stay stop-to-stop", () => {
    const t = trip([poi("a", "d1", 0, 0, 2), poi("b", "d1", 1, 0, 5)]);
    const vias: TripVia[] = [{ id: "v1", afterPoiId: "a", lat: 0, lng: 3, seq: 0 }];
    const { waypoints, legDayId, legAfterPoiId } = buildRoute(t, vias);
    // start, a, via(after a), b, end
    expect(waypoints.map((w) => [w.lat, w.lng, !!w.via])).toEqual([
      [0, 0, false],
      [0, 2, false],
      [0, 3, true],
      [0, 5, false],
      [0, 10, false],
    ]);
    // 3 stop-legs: start->a, a->b, b->end
    expect(legAfterPoiId).toEqual([null, "a", "b"]);
    expect(legDayId).toEqual(["d1", "d1", "d1"]);
  });

  test("via with null anchor goes right after start", () => {
    const t = trip([poi("a", "d1", 0, 0, 2)]);
    const vias: TripVia[] = [{ id: "v1", afterPoiId: null, lat: 0, lng: 1, seq: 0 }];
    const { waypoints } = buildRoute(t, vias);
    expect(waypoints.map((w) => [w.lng, !!w.via])).toEqual([
      [0, false], // start
      [1, true],  // via
      [2, false], // a
      [10, false],// end
    ]);
  });

  test("skips vias whose anchor stop is not scheduled", () => {
    const t = trip([poi("a", "d1", 0, 0, 2)]);
    const vias: TripVia[] = [{ id: "v1", afterPoiId: "ghost", lat: 0, lng: 3, seq: 0 }];
    const { waypoints } = buildRoute(t, vias);
    expect(waypoints.some((w) => w.via)).toBe(false);
  });

  test("no stops yields start + end with one leg", () => {
    const t = trip([]);
    const { waypoints, legAfterPoiId, legDayId } = buildRoute(t, []);
    expect(waypoints.length).toBe(2);
    expect(legAfterPoiId).toEqual([null]);
    expect(legDayId).toEqual([null]);
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `bun test tests/routing/build-route.test.ts`
Expected: FAIL — `buildRoute`/`TripVia` not exported.

- [ ] **Step 3: Implement** — append to `lib/routing/itinerary-route.ts` (keep `orderedRoutePoints`/`attributeLegDurations`). Add imports at the top if not present:
```ts
import type { RouteWaypoint } from "@/lib/routing/routes";
```
Append:
```ts
export type TripVia = { id: string; afterPoiId: string | null; lat: number; lng: number; seq: number };

export type BuiltRoute = {
  waypoints: RouteWaypoint[];
  legDayId: (string | null)[];
  legAfterPoiId: (string | null)[];
};

/** Build the route waypoint list (with vias as via:true after their anchor stop)
 *  plus per stop-to-stop leg the day (arrival) and the anchor stop id (leg start). */
export function buildRoute(trip: TripDetail, vias: TripVia[]): BuiltRoute {
  const dayIndexById = new Map(trip.days.map((d) => [d.id, d.dayIndex]));
  const stops = trip.pois
    .filter((p) => p.dayId !== null)
    .sort((a, b) => {
      const da = dayIndexById.get(a.dayId as string) ?? 0;
      const db = dayIndexById.get(b.dayId as string) ?? 0;
      if (da !== db) return da - db;
      return (a.orderInDay ?? 0) - (b.orderInDay ?? 0);
    });

  const start: RouteWaypoint = { lat: trip.startLat, lng: trip.startLng };
  const end: RouteWaypoint =
    trip.endLat != null && trip.endLng != null
      ? { lat: trip.endLat, lng: trip.endLng }
      : { lat: trip.startLat, lng: trip.startLng };

  const scheduled = new Set(stops.map((s) => s.id));
  const byAnchor = new Map<string | null, TripVia[]>();
  for (const v of vias) {
    if (v.afterPoiId !== null && !scheduled.has(v.afterPoiId)) continue; // skip orphans
    const list = byAnchor.get(v.afterPoiId) ?? [];
    list.push(v);
    byAnchor.set(v.afterPoiId, list);
  }
  for (const list of byAnchor.values()) list.sort((a, b) => a.seq - b.seq);

  const waypoints: RouteWaypoint[] = [start];
  for (const v of byAnchor.get(null) ?? []) waypoints.push({ lat: v.lat, lng: v.lng, via: true });
  for (const s of stops) {
    waypoints.push({ lat: s.lat, lng: s.lng });
    for (const v of byAnchor.get(s.id) ?? []) waypoints.push({ lat: v.lat, lng: v.lng, via: true });
  }
  waypoints.push(end);

  const n = stops.length;
  const legDayId: (string | null)[] = [];
  const legAfterPoiId: (string | null)[] = [];
  for (let i = 0; i < n + 1; i++) {
    legDayId.push(i < n ? (stops[i].dayId as string) : (n ? (stops[n - 1].dayId as string) : null));
    legAfterPoiId.push(i === 0 ? null : stops[i - 1].id);
  }

  return { waypoints, legDayId, legAfterPoiId };
}
```

- [ ] **Step 4: Run and confirm pass**

Run: `bun test tests/routing/build-route.test.ts`
Expected: PASS (4 cases).

- [ ] **Step 5: Commit**

```bash
git add lib/routing/itinerary-route.ts tests/routing/build-route.test.ts
git commit -m "feat: add buildRoute (via insertion + per-leg anchors) with tests"
```

---

## Task 5: Route endpoint per-leg output + via API routes

**Files:** modify `app/api/trips/[tripId]/route/route.ts`, `lib/itinerary/schema.ts`; create `app/api/trips/[tripId]/vias/route.ts`, `app/api/vias/[viaId]/route.ts`.

- [ ] **Step 1: Rewrite `app/api/trips/[tripId]/route/route.ts`**
```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getTrip } from "@/lib/trips/service";
import { computeRoute, RouteError } from "@/lib/routing/routes";
import { buildRoute, attributeLegDurations, type TripVia } from "@/lib/routing/itinerary-route";
import type { TripDetail } from "@/lib/api/trips";

type Ctx = { params: Promise<{ tripId: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { tripId } = await params;
  const trip = await getTrip(prisma, tripId);
  if (!trip) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const vias = ((trip as unknown as { routeVias?: TripVia[] }).routeVias ?? []) as TripVia[];
  const { waypoints, legDayId, legAfterPoiId } = buildRoute(trip as unknown as TripDetail, vias);

  if (waypoints.length < 2) {
    return NextResponse.json({ legs: [], perDaySeconds: {}, totalSeconds: 0, totalMeters: 0 });
  }

  try {
    const route = await computeRoute(waypoints, undefined, { legPolylines: true });
    const { perDaySeconds, totalSeconds } = attributeLegDurations(
      legDayId,
      route.legs.map((l) => l.durationSeconds),
    );
    return NextResponse.json({
      legs: route.legs.map((l, i) => ({
        encodedPolyline: l.encodedPolyline ?? null,
        afterPoiId: legAfterPoiId[i] ?? null,
      })),
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

- [ ] **Step 2: Add via schemas to `lib/itinerary/schema.ts`** (append):
```ts
export const addViaSchema = z.object({
  afterPoiId: z.string().nullable(),
  lat: z.number(),
  lng: z.number(),
});
export const moveViaSchema = z.object({ lat: z.number(), lng: z.number() });
```

- [ ] **Step 3: Create `app/api/trips/[tripId]/vias/route.ts`**
```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { addVia, ItineraryError } from "@/lib/itinerary/operations";
import { addViaSchema } from "@/lib/itinerary/schema";

type Ctx = { params: Promise<{ tripId: string }> };

export async function POST(req: Request, { params }: Ctx) {
  const { tripId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = addViaSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const via = await addVia(prisma, tripId, parsed.data);
    return NextResponse.json(via, { status: 201 });
  } catch (e) {
    if (e instanceof ItineraryError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }
}
```

- [ ] **Step 4: Create `app/api/vias/[viaId]/route.ts`**
```ts
import { NextResponse } from "next/server";
import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/db";
import { moveVia, removeVia } from "@/lib/itinerary/operations";
import { moveViaSchema } from "@/lib/itinerary/schema";

type Ctx = { params: Promise<{ viaId: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const { viaId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = moveViaSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const via = await moveVia(prisma, viaId, parsed.data);
    return NextResponse.json(via);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    throw e;
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { viaId } = await params;
  try {
    await removeVia(prisma, viaId);
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    throw e;
  }
}
```

- [ ] **Step 5: Build**

Run: `bun run build`
Expected: NOTE — this may fail to type-check because `RouteResult` (in `lib/api/trips.ts`) still declares `encodedPolyline` and the endpoint now returns `legs`; and `trip` may need `routeVias` from `getTrip` (Task 6). That's expected; Task 6 aligns the types and `getTrip`. If it fails ONLY for those reasons, proceed; otherwise fix. (You can still `bun run test` to confirm operations/route-builder suites pass.)

- [ ] **Step 6: Commit**

```bash
git add "app/api/trips/[tripId]/route/route.ts" lib/itinerary/schema.ts "app/api/trips/[tripId]/vias" "app/api/vias"
git commit -m "feat: route endpoint returns per-leg polylines; add via API routes"
```

---

## Task 6: getTrip routeVias + client types + via hooks

**Files:** modify `lib/trips/service.ts`, `lib/api/trips.ts`; create `hooks/use-via-mutations.ts`.

- [ ] **Step 1: Include routeVias in `getTrip`** — in `lib/trips/service.ts`, add to the `getTrip` `include`:
```ts
      routeVias: true,
```

- [ ] **Step 2: Update `lib/api/trips.ts` types + fetchers**

Replace the `RouteResult` type with a per-leg shape:
```ts
export type RouteLegResult = { encodedPolyline: string | null; afterPoiId: string | null };
export type RouteResult = {
  legs: RouteLegResult[];
  perDaySeconds: Record<string, number>;
  totalSeconds: number;
  totalMeters: number;
};
```
Add a via type and put it on `TripDetail`:
```ts
export type TripVia = { id: string; afterPoiId: string | null; lat: number; lng: number; seq: number };
```
In `TripDetail`, add:
```ts
  routeVias: TripVia[];
```
Append via fetchers:
```ts
export async function addViaRequest(
  tripId: string,
  afterPoiId: string | null,
  lat: number,
  lng: number,
): Promise<void> {
  const res = await fetch(`/api/trips/${tripId}/vias`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ afterPoiId, lat, lng }),
  });
  if (!res.ok) throw new Error(`Failed to add via (${res.status})`);
}

export async function moveViaRequest(viaId: string, lat: number, lng: number): Promise<void> {
  const res = await fetch(`/api/vias/${viaId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ lat, lng }),
  });
  if (!res.ok) throw new Error(`Failed to move via (${res.status})`);
}

export async function removeViaRequest(viaId: string): Promise<void> {
  const res = await fetch(`/api/vias/${viaId}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Failed to remove via (${res.status})`);
}
```

- [ ] **Step 3: Create `hooks/use-via-mutations.ts`**
```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { addViaRequest, moveViaRequest, removeViaRequest } from "@/lib/api/trips";
import { tripQueryKey } from "@/hooks/use-trip";
import { routeQueryKey } from "@/hooks/use-route";

function useViaMutation<TArgs>(tripId: string, fn: (a: TArgs) => Promise<void>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: tripQueryKey(tripId) });
      qc.invalidateQueries({ queryKey: routeQueryKey(tripId) });
    },
  });
}

export function useAddVia(tripId: string) {
  return useViaMutation(tripId, (v: { afterPoiId: string | null; lat: number; lng: number }) =>
    addViaRequest(tripId, v.afterPoiId, v.lat, v.lng),
  );
}

export function useMoveVia(tripId: string) {
  return useViaMutation(tripId, (v: { viaId: string; lat: number; lng: number }) =>
    moveViaRequest(v.viaId, v.lat, v.lng),
  );
}

export function useRemoveVia(tripId: string) {
  return useViaMutation(tripId, (viaId: string) => removeViaRequest(viaId));
}
```

- [ ] **Step 4: Build**

Run: `bun run build`
Expected: NOTE — `components/trip-map.tsx` / `planner-shell.tsx` still reference `route.encodedPolyline` (now removed from `RouteResult`), so this may fail until Task 7. If it fails ONLY there, proceed to Task 7. `bun run test` should pass.

- [ ] **Step 5: Commit**

```bash
git add lib/trips/service.ts lib/api/trips.ts hooks/use-via-mutations.ts
git commit -m "feat: expose routeVias + per-leg RouteResult + via hooks"
```

---

## Task 7: Map — per-leg clickable polylines + draggable via diamonds

**Files:** modify `components/trip-map.tsx`, `components/planner-shell.tsx`.

> This is the bulk. The map renders each route leg as its own clickable `google.maps.Polyline` (clicking yields the leg's `afterPoiId` + clicked latLng → create a via) and renders each via as a draggable diamond `AdvancedMarker` (drag → move; double-click → remove).

- [ ] **Step 1: Rewrite `components/trip-map.tsx`**
```tsx
"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  Map,
  AdvancedMarker,
  Pin,
  useMap,
  useMapsLibrary,
} from "@vis.gl/react-google-maps";
import type { AddPoiInput } from "@/lib/itinerary/operations";
import { categoryFromTypes } from "@/lib/places/category";
import type { RouteLegResult, TripVia } from "@/lib/api/trips";

export type MapPoint = { lat: number; lng: number; name: string; id?: string };

export function TripMap({
  start,
  end,
  pois = [],
  onAddPlace,
  legs = [],
  vias = [],
  onAddVia,
  onMoveVia,
  onRemoveVia,
}: {
  start: MapPoint;
  end?: MapPoint | null;
  pois?: MapPoint[];
  onAddPlace?: (input: AddPoiInput) => void;
  legs?: RouteLegResult[];
  vias?: TripVia[];
  onAddVia?: (afterPoiId: string | null, lat: number, lng: number) => void;
  onMoveVia?: (viaId: string, lat: number, lng: number) => void;
  onRemoveVia?: (viaId: string) => void;
}) {
  const mapId = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID ?? "DEMO_MAP_ID";
  const placesLib = useMapsLibrary("places");
  const path: MapPoint[] = useMemo(
    () => [start, ...pois, ...(end ? [end] : [])],
    [start, end, pois],
  );

  return (
    <Map
      defaultCenter={{ lat: start.lat, lng: start.lng }}
      defaultZoom={7}
      mapId={mapId}
      gestureHandling="greedy"
      style={{ width: "100%", height: "100%" }}
      onClick={async (ev) => {
        const placeId = ev.detail.placeId;
        if (!placeId || !onAddPlace || !placesLib) return;
        ev.stop();
        const place = new placesLib.Place({ id: placeId });
        await place.fetchFields({ fields: ["location", "displayName", "id", "types"] });
        const loc = place.location;
        if (!loc) return;
        onAddPlace({
          name: place.displayName ?? "Unnamed place",
          lat: loc.lat(),
          lng: loc.lng(),
          placeId: place.id ?? null,
          category: categoryFromTypes(place.types ?? []),
          source: "map",
        });
      }}
    >
      <AdvancedMarker position={start} title={start.name}>
        <Pin background="#16a34a" borderColor="#15803d" glyphColor="#ffffff" />
      </AdvancedMarker>

      {pois.map((p, i) => (
        <AdvancedMarker key={p.id ?? i} position={p} title={p.name}>
          <Pin />
        </AdvancedMarker>
      ))}

      {end && (
        <AdvancedMarker position={end} title={end.name}>
          <Pin background="#dc2626" borderColor="#b91c1c" glyphColor="#ffffff" />
        </AdvancedMarker>
      )}

      <RouteLegs legs={legs} fallback={path} onAddVia={onAddVia} />

      {vias.map((v) => (
        <AdvancedMarker
          key={v.id}
          position={{ lat: v.lat, lng: v.lng }}
          draggable
          onDragEnd={(e) => {
            const lat = e.latLng?.lat;
            const lng = e.latLng?.lng;
            if (lat != null && lng != null && onMoveVia) onMoveVia(v.id, lat, lng);
          }}
        >
          <div
            onDoubleClick={() => onRemoveVia?.(v.id)}
            title="Double-click to remove this control point"
            style={{
              width: 12,
              height: 12,
              background: "#f59e0b",
              border: "2px solid #b45309",
              transform: "rotate(45deg)",
              cursor: "grab",
            }}
          />
        </AdvancedMarker>
      ))}

      <FitBounds points={path} />
    </Map>
  );
}

function RouteLegs({
  legs,
  fallback,
  onAddVia,
}: {
  legs: RouteLegResult[];
  fallback: MapPoint[];
  onAddVia?: (afterPoiId: string | null, lat: number, lng: number) => void;
}) {
  const map = useMap();
  const geometry = useMapsLibrary("geometry");
  const onAddViaRef = useRef(onAddVia);
  onAddViaRef.current = onAddVia;

  useEffect(() => {
    if (!map) return;
    const lines: google.maps.Polyline[] = [];

    const encodedLegs = legs.filter((l) => l.encodedPolyline);
    if (encodedLegs.length && geometry) {
      for (const leg of encodedLegs) {
        const coords = geometry.encoding
          .decodePath(leg.encodedPolyline as string)
          .map((p) => ({ lat: p.lat(), lng: p.lng() }));
        const line = new google.maps.Polyline({
          path: coords,
          clickable: true,
          strokeColor: "#2563eb",
          strokeOpacity: 0.85,
          strokeWeight: 5,
        });
        line.addListener("click", (e: google.maps.PolyMouseEvent) => {
          if (!e.latLng || !onAddViaRef.current) return;
          onAddViaRef.current(leg.afterPoiId, e.latLng.lat(), e.latLng.lng());
        });
        line.setMap(map);
        lines.push(line);
      }
    } else if (fallback.length >= 2) {
      const line = new google.maps.Polyline({
        path: fallback.map((p) => ({ lat: p.lat, lng: p.lng })),
        geodesic: true,
        strokeColor: "#2563eb",
        strokeOpacity: 0.85,
        strokeWeight: 4,
      });
      line.setMap(map);
      lines.push(line);
    }

    return () => lines.forEach((l) => l.setMap(null));
  }, [map, geometry, legs, fallback]);

  return null;
}

function FitBounds({ points }: { points: MapPoint[] }) {
  const map = useMap();
  const hasFit = useRef(false);
  useEffect(() => {
    if (!map || points.length === 0 || hasFit.current) return;
    if (points.length === 1) {
      map.setCenter({ lat: points[0].lat, lng: points[0].lng });
      map.setZoom(10);
    } else {
      const bounds = new google.maps.LatLngBounds();
      points.forEach((p) => bounds.extend({ lat: p.lat, lng: p.lng }));
      map.fitBounds(bounds, 64);
    }
    hasFit.current = true;
  }, [map, points]);
  return null;
}
```
> If `@types/google.maps` types `PolyMouseEvent`/`AdvancedMarker onDragEnd` latLng differently, adjust the access (e.g. `e.latLng.lat()` vs `.lat`) to satisfy the compiler — keep behavior. `AdvancedMarker` drag requires the `mapId` (already set).

- [ ] **Step 2: Wire into `components/planner-shell.tsx`**

(a) Add the via hooks import:
```tsx
import { useAddVia, useMoveVia, useRemoveVia } from "@/hooks/use-via-mutations";
```
(b) After `const resplit = useResplit(tripId);`, add:
```tsx
  const addVia = useAddVia(tripId);
  const moveVia = useMoveVia(tripId);
  const removeVia = useRemoveVia(tripId);
```
(c) Replace the `<TripMap … routePolyline={route?.encodedPolyline ?? null} />` usage with:
```tsx
            <TripMap
              start={start}
              end={end}
              pois={poiPoints}
              onAddPlace={handleAddFromMap}
              legs={route?.legs ?? []}
              vias={trip.routeVias}
              onAddVia={(afterPoiId, lat, lng) => addVia.mutate({ afterPoiId, lat, lng })}
              onMoveVia={(viaId, lat, lng) => moveVia.mutate({ viaId, lat, lng })}
              onRemoveVia={(viaId) => removeVia.mutate(viaId)}
            />
```

- [ ] **Step 3: Build + tests**

Run: `bun run build` (now green — RouteResult.legs consumed) then `bun run test` (all pass).

- [ ] **Step 4: Commit**

```bash
git add components/trip-map.tsx components/planner-shell.tsx
git commit -m "feat: clickable route legs to add via-points + draggable via diamonds"
```

---

## Task 8: Full verification

**Files:** none.

- [ ] **Step 1: Tests + build**

Run: `bun run test` (all pass, incl. via, build-route, routes via/legPolylines suites) and `bun run build` (success; `ƒ /api/trips/[tripId]/vias` and `ƒ /api/vias/[viaId]` present).

- [ ] **Step 2: Manual smoke test** (dev server, real key, Routes API enabled)

Run `bun run dev`, open a trip with a few stops scheduled into days (so a real route is drawn), then:
1. **Click the blue route line** between two stops → an amber **diamond** appears there and the route re-bends through it (after a moment).
2. **Drag the diamond** onto a different road → the route follows; the diamond stays.
3. The diamond is **not** a stop — no new pin/POI, no day-list entry; per-day/total drive time updates (a via usually increases it).
4. **Double-click the diamond** → it's removed and the route snaps back.
5. Add a via, then **unschedule its anchor stop** (day select → "—") → the via stops affecting the route (orphan skipped) but isn't deleted; re-assign the stop to a day → the via shapes it again.

Expected: all five. If clicking the line does nothing, try clicking precisely on it (the stroke is 5px); a 502 means the Routes API isn't enabled for the key.

- [ ] **Step 3: Final commit (notes, if any)**

```bash
git add -A
git commit -m "docs: via-points verified" --allow-empty
```

---

## Done — Definition of Done

- `bun run test` passes (adds via ops, buildRoute, computeRoute via/legPolylines suites).
- `bun run build` succeeds with the via endpoints.
- Clicking a route leg drops a via that bends the route; dragging moves it; double-click removes it; a via is never a stop and doesn't change leg→day drive-time attribution; orphaned vias are skipped but preserved.
