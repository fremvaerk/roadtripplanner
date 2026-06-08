# Night Stops Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 🌙 "mark a place as overnight" with a first-class, per-day night stop — a draggable map point with title/url/notes that ends the day, so dragging it changes that day's and the next day's drive times.

**Architecture:** A `NightStop` model (one per day) replaces `Poi.isOvernight`. Night stops are inserted into the route as stopover waypoints at day boundaries (`buildRoute`), so per-day drive time = "driving until you sleep." Draggable 🛏 markers on the map (`updateNight` on drop) + a per-day editable block in the sidebar. The old overnight feature is fully removed first (Task 1), then the column is dropped (Task 2).

**Tech Stack:** Next.js 16 + React 19, Prisma 7 (libSQL), Google Routes API, TanStack Query v5, `@vis.gl/react-google-maps`, Bun test runner.

---

## Sequencing note

`isOvernight` is referenced across ~9 source files and 5 test files. **Task 1 removes all of those usages while the DB column still exists** (so everything compiles/tests green), **Task 2 then drops the column** and adds `NightStop`. Tasks 3–6 build the feature. This keeps each task's `bun run test` green.

---

## Task 1: Remove the old overnight feature (code + tests; column stays)

**Files:** `lib/itinerary/operations.ts`, `lib/itinerary/move.ts`, `lib/itinerary/schema.ts`, `app/api/pois/[poiId]/route.ts`, `lib/itinerary/split-trip.ts`, `lib/api/trips.ts`, `hooks/use-poi-mutations.ts`, `components/poi-card.tsx`, and tests `tests/itinerary/operations.test.ts`, `tests/itinerary/move.test.ts`, `tests/itinerary/optimize-day.test.ts`, `tests/itinerary/schema.test.ts`, `tests/itinerary/split-trip.test.ts`, `tests/routing/build-route.test.ts`, `tests/routing/itinerary-route.test.ts`.

- [ ] **Step 1: `lib/itinerary/operations.ts`**

(a) In `movePoi`, the day-branch loop currently clears `isOvernight` on cross-day move. Replace:
```ts
    const changedDay = oldDayId !== dayId;
    for (let i = 0; i < ids.length; i++) {
      // Moving to a different day drops the overnight flag (overnight is per-day);
      // a same-day reorder keeps it.
      const data =
        ids[i] === poiId && changedDay
          ? { dayId, orderInDay: i, isOvernight: false }
          : { dayId, orderInDay: i };
      await tx.poi.update({ where: { id: ids[i] }, data });
    }
```
with:
```ts
    for (let i = 0; i < ids.length; i++) {
      await tx.poi.update({ where: { id: ids[i] }, data: { dayId, orderInDay: i } });
    }
```
(b) In `movePoi`, the pool branch: replace `data: { dayId: null, orderInDay: null, isOvernight: false },` with `data: { dayId: null, orderInDay: null },`.
(c) In `optimizeDay`, replace `const destination = stops.find((s) => s.isOvernight) ?? stops[stops.length - 1];` with `const destination = stops[stops.length - 1];`.
(d) Delete the entire `setOvernight` function.

- [ ] **Step 2: `lib/itinerary/move.ts`** — replace the moving-POI branch:
```ts
    if (p.id === poiId) {
      if (dayId === null) {
        return { ...p, dayId: null, orderInDay: null, isOvernight: false };
      }
      // Moving to a different day drops the overnight flag; same-day reorder keeps it.
      return oldDayId !== dayId
        ? { ...p, dayId, orderInDay: destOrder.get(p.id) ?? 0, isOvernight: false }
        : { ...p, dayId, orderInDay: destOrder.get(p.id) ?? 0 };
    }
```
with:
```ts
    if (p.id === poiId) {
      return dayId === null
        ? { ...p, dayId: null, orderInDay: null }
        : { ...p, dayId, orderInDay: destOrder.get(p.id) ?? 0 };
    }
```
(`oldDayId` may now be unused — if the linter flags it, remove its declaration.)

- [ ] **Step 3: `lib/itinerary/schema.ts`** — remove the `overnight` member from `patchPoiSchema`'s discriminated union (the `z.object({ op: z.literal("overnight"), isOvernight: z.boolean() })` entry). The union keeps `move` and `group`.

- [ ] **Step 4: `app/api/pois/[poiId]/route.ts`** — remove `setOvernight` from the operations import, and change the PATCH dispatch (now only `move` | `group`):
```ts
    let poi;
    if (data.op === "move") {
      poi = await movePoi(prisma, poiId, { dayId: data.dayId, orderInDay: data.orderInDay });
    } else {
      poi = await moveToGroup(prisma, poiId, data.groupId, data.orderInGroup);
    }
```

- [ ] **Step 5: `lib/itinerary/split-trip.ts`** — in `splitPoolIntoDays`, replace the overnight-aware placement:
```ts
      const existing = trip.pois
        .filter((p) => p.dayId === day.id)
        .sort((a, b) => (a.orderInDay ?? 0) - (b.orderInDay ?? 0));
      const overnight = existing.filter((p) => p.isOvernight).map((p) => p.id);
      const others = existing.filter((p) => !p.isOvernight).map((p) => p.id);
      const finalIds = [...others, ...newIds, ...overnight];
```
with:
```ts
      const existing = trip.pois
        .filter((p) => p.dayId === day.id)
        .sort((a, b) => (a.orderInDay ?? 0) - (b.orderInDay ?? 0))
        .map((p) => p.id);
      const finalIds = [...existing, ...newIds];
```
And in `resplitAll`, replace `data: { dayId: null, orderInDay: null, isOvernight: false },` with `data: { dayId: null, orderInDay: null },`.

- [ ] **Step 6: `lib/api/trips.ts`** — remove `isOvernight: boolean;` from `PoiDetail`. Delete the `patchPoiOvernight` fetcher.

- [ ] **Step 7: `hooks/use-poi-mutations.ts`** — remove `patchPoiOvernight` from the `@/lib/api/trips` import and delete the `useSetOvernight` hook.

- [ ] **Step 8: `components/poi-card.tsx`** — change the import to `import { useMovePoi } from "@/hooks/use-poi-mutations";` (drop `useSetOvernight`); remove `const setOvernight = useSetOvernight(tripId);`; change the name span from `{poi.isOvernight ? "🌙 " : ""}{poi.name}` to just `{poi.name}`; delete the 🌙 `<Button>` element entirely. (The card keeps the drag handle, name, and the ✕ remove-from-day button.)

- [ ] **Step 9: Update tests** — delete overnight tests and fixture fields:
  - `tests/itinerary/operations.test.ts`: in the import line drop `setOvernight`; delete the whole `describe("setOvernight", …)` block and the whole `describe("movePoi + overnight interaction", …)` block. (Keep "moves a day POI to the pool…" — its body doesn't assert `isOvernight`.)
  - `tests/itinerary/move.test.ts`: in `poi()` remove `isOvernight: false,` from the returned object. In the test "moving to the pool clears day/order/overnight…": change the fixture `poi("a", "d1", 0, { isOvernight: true })` to `poi("a", "d1", 0)` and delete the line `expect(a.isOvernight).toBe(false);`. Delete the two tests "moving an overnight POI to a different day clears its overnight flag" and "reordering an overnight POI within the same day keeps its overnight flag".
  - `tests/itinerary/optimize-day.test.ts`: drop `setOvernight` from the import; delete the test "uses the overnight stop as the fixed destination".
  - `tests/itinerary/schema.test.ts`: delete the test "accepts an overnight op".
  - `tests/itinerary/split-trip.test.ts`: drop `setOvernight` from the import; delete the tests "appends pool stops before an existing overnight (overnight stays last)" and "clears overnight flags (a fresh split)".
  - `tests/routing/build-route.test.ts` and `tests/routing/itinerary-route.test.ts`: in each `poi()` helper remove `isOvernight: false,`.

- [ ] **Step 10: Build + test**

Run: `bun run build` (success) then `bun run test` (all pass). The `Poi.isOvernight` column still exists in the DB but nothing reads/writes it now.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "refactor: remove the isOvernight overnight feature (code + tests)"
```

---

## Task 2: Schema — drop isOvernight, add NightStop

**Files:** `prisma/schema.prisma`.

- [ ] **Step 1: Edit `prisma/schema.prisma`**

(a) In the `Poi` model, delete the line `isOvernight  Boolean  @default(false)`.
(b) In the `Day` model, add: `night NightStop?`.
(c) Add the model:
```prisma
model NightStop {
  id        String   @id @default(cuid())
  dayId     String   @unique
  day       Day      @relation(fields: [dayId], references: [id], onDelete: Cascade)
  lat       Float
  lng       Float
  title     String?
  url       String?
  notes     String?
  createdAt DateTime @default(now())
}
```

- [ ] **Step 2: Push + verify**

Run: `bunx prisma db push` (applies; drops `isOvernight`; regenerates client). Then `sqlite3 dev.db ".tables"` → `NightStop` listed.

- [ ] **Step 3: Build + test**

Run: `bun run build` (success) then `bun run test` (all pass — no code references `isOvernight` after Task 1).

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat: drop Poi.isOvernight; add NightStop model"
```

---

## Task 3: Night operations — TDD

**Files:** modify `lib/itinerary/operations.ts`; test `tests/itinerary/night.test.ts`.

- [ ] **Step 1: Write the failing test** `tests/itinerary/night.test.ts`:
```ts
import { test, expect, describe, beforeEach, afterAll } from "bun:test";
import { PrismaClient } from "@/lib/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { setNight, updateNight, clearNight, ItineraryError } from "@/lib/itinerary/operations";
import { createTrip } from "@/lib/trips/service";
import type { CreateTripData } from "@/lib/trips/schema";

const prisma = new PrismaClient({
  adapter: new PrismaLibSql({ url: process.env.DATABASE_URL ?? "file:./test.db" }),
});

beforeEach(async () => {
  await prisma.nightStop.deleteMany();
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
    title: "T", description: "d", isRoundTrip: false, startDate: null, dayCount: 2,
    start: { name: "S", lat: 0, lng: 0, placeId: null },
    end: { name: "E", lat: 1, lng: 1, placeId: null },
  };
}

describe("night operations", () => {
  test("setNight creates the day's night with details", async () => {
    const trip = await createTrip(prisma, sampleTrip());
    const n = await setNight(prisma, trip.days[0].id, {
      lat: 0.5, lng: 0.5, title: "Parking near forest", url: "https://airbnb.com/x", notes: "quiet",
    });
    expect(n.dayId).toBe(trip.days[0].id);
    expect(n.title).toBe("Parking near forest");
    expect(n.url).toBe("https://airbnb.com/x");
  });

  test("setNight is one-per-day (upsert overwrites)", async () => {
    const trip = await createTrip(prisma, sampleTrip());
    await setNight(prisma, trip.days[0].id, { lat: 0.5, lng: 0.5, title: "A" });
    const n2 = await setNight(prisma, trip.days[0].id, { lat: 0.6, lng: 0.6, title: "B" });
    expect(n2.title).toBe("B");
    expect(await prisma.nightStop.count({ where: { dayId: trip.days[0].id } })).toBe(1);
  });

  test("updateNight changes coordinates and details", async () => {
    const trip = await createTrip(prisma, sampleTrip());
    await setNight(prisma, trip.days[0].id, { lat: 0.5, lng: 0.5 });
    const u = await updateNight(prisma, trip.days[0].id, { lat: 0.9, title: "Moved" });
    expect(u.lat).toBeCloseTo(0.9);
    expect(u.title).toBe("Moved");
    expect(u.lng).toBeCloseTo(0.5); // unchanged
  });

  test("clearNight removes it", async () => {
    const trip = await createTrip(prisma, sampleTrip());
    await setNight(prisma, trip.days[0].id, { lat: 0.5, lng: 0.5 });
    await clearNight(prisma, trip.days[0].id);
    expect(await prisma.nightStop.count()).toBe(0);
  });

  test("updateNight on a day with no night throws", async () => {
    const trip = await createTrip(prisma, sampleTrip());
    await expect(updateNight(prisma, trip.days[1].id, { lat: 1 })).rejects.toBeInstanceOf(ItineraryError);
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `bun run test`
Expected: night suite fails (exports missing).

- [ ] **Step 3: Implement** — append to `lib/itinerary/operations.ts`:
```ts
export async function setNight(
  prisma: PrismaClient,
  dayId: string,
  input: { lat: number; lng: number; title?: string | null; url?: string | null; notes?: string | null },
) {
  return prisma.nightStop.upsert({
    where: { dayId },
    create: {
      dayId,
      lat: input.lat,
      lng: input.lng,
      title: input.title ?? null,
      url: input.url ?? null,
      notes: input.notes ?? null,
    },
    update: {
      lat: input.lat,
      lng: input.lng,
      title: input.title ?? null,
      url: input.url ?? null,
      notes: input.notes ?? null,
    },
  });
}

export async function updateNight(
  prisma: PrismaClient,
  dayId: string,
  patch: { lat?: number; lng?: number; title?: string | null; url?: string | null; notes?: string | null },
) {
  const existing = await prisma.nightStop.findUnique({ where: { dayId } });
  if (!existing) throw new ItineraryError("This day has no night stop");
  return prisma.nightStop.update({ where: { dayId }, data: patch });
}

export async function clearNight(prisma: PrismaClient, dayId: string) {
  return prisma.nightStop.deleteMany({ where: { dayId } });
}
```

- [ ] **Step 4: Run and confirm pass**

Run: `bun run test`
Expected: all pass including the 5 night cases.

- [ ] **Step 5: Commit**

```bash
git add lib/itinerary/operations.ts tests/itinerary/night.test.ts
git commit -m "feat: add night operations (set/update/clear) with tests"
```

---

## Task 4: `buildRoute` inserts day nights — TDD

**Files:** modify `lib/api/trips.ts` (add `night` to `DayDetail`), `lib/routing/itinerary-route.ts`; test `tests/routing/build-route.test.ts`.

> Nights are stopovers at day boundaries: after each day's stops (and their vias), insert that day's night. Legs stay stopover-to-stopover; the leg arriving at a night is attributed to that day. `buildRoute` reads `trip.days[].night`.

- [ ] **Step 1: Add `night` to `DayDetail`** in `lib/api/trips.ts`:
```ts
export type DayNight = { id: string; lat: number; lng: number; title: string | null; url: string | null; notes: string | null };
```
and add to `DayDetail`:
```ts
  night: DayNight | null;
```

- [ ] **Step 2: Add a failing test** — append inside `describe("buildRoute", …)` in `tests/routing/build-route.test.ts`. First update the `trip()` helper's days to allow a night; change the helper to accept nights is overkill — instead add a test that sets `night` on a day inline:
```ts
  test("inserts a day's night as a stopover at the day boundary, attributed to that day", () => {
    const t = trip([poi("a", "d1", 0, 0, 2), poi("b", "d2", 0, 0, 6)]);
    // d1 has 1 stop (a) then a night; d2 has 1 stop (b)
    t.days = [
      { id: "d1", dayIndex: 0, pois: [], night: { id: "n1", lat: 0, lng: 4, title: null, url: null, notes: null } },
      { id: "d2", dayIndex: 1, pois: [], night: null },
    ];
    const { waypoints, legDayId, legAfterPoiId } = buildRoute(t, []);
    // start, a, night(0,4), b, end
    expect(waypoints.map((w) => [w.lng, !!w.via])).toEqual([
      [0, false], [2, false], [4, false], [6, false], [10, false],
    ]);
    // legs: start->a (d1), a->night (d1), night->b (d2), b->end (d2)
    expect(legDayId).toEqual(["d1", "d1", "d2", "d2"]);
    // anchor stop at each leg start: null(start), a, null(night has no poi), b
    expect(legAfterPoiId).toEqual([null, "a", null, "b"]);
  });
```
> Note: this trip's two stops are on different days (d1, d2). The base `trip()` helper sets `days` with both d1 and d2 (dayIndex 0,1) and now both need a `night` field — update the helper's `days` entries to include `night: null` so the type is satisfied, then the test overrides `t.days`.

Also update the `trip()` helper in this file so its default `days` include `night: null`:
```ts
    days: [
      { id: "d1", dayIndex: 0, pois: [], night: null },
      { id: "d2", dayIndex: 1, pois: [], night: null },
    ],
```
(The build-route helper currently only defines `d1`; change it to the two-day version above so the new test's `d2` stop is valid. Existing build-route tests only use `d1`, which still exists.)

- [ ] **Step 3: Run and confirm failure**

Run: `bun test tests/routing/build-route.test.ts`
Expected: FAIL — nights not inserted (waypoints missing the night; legDayId/legAfterPoiId wrong).

- [ ] **Step 4: Implement** — rewrite `buildRoute` in `lib/routing/itinerary-route.ts` to iterate by day and insert nights. Replace the existing `buildRoute` body with:
```ts
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
  const end: RouteWaypoint =
    trip.endLat != null && trip.endLng != null
      ? { lat: trip.endLat, lng: trip.endLng }
      : { lat: trip.startLat, lng: trip.startLng };

  const scheduled = new Set(trip.pois.filter((p) => p.dayId !== null).map((p) => p.id));
  const byAnchor = new Map<string | null, TripVia[]>();
  for (const v of vias) {
    if (v.afterPoiId !== null && !scheduled.has(v.afterPoiId)) continue;
    const list = byAnchor.get(v.afterPoiId) ?? [];
    list.push(v);
    byAnchor.set(v.afterPoiId, list);
  }
  for (const list of byAnchor.values()) list.sort((a, b) => a.seq - b.seq);

  // Build the ordered list of STOPOVERS (start, stops, nights, end) with metadata,
  // and interleave vias (non-stopover) right after their anchor.
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

  stopovers.push({ wp: end, dayId: null, poiId: null });
  waypoints.push(end);

  // last day that has any content, for attributing the final leg into `end`
  const lastContentDayId =
    [...stopovers].reverse().find((s) => s.dayId !== null)?.dayId ?? null;

  const legDayId: (string | null)[] = [];
  const legAfterPoiId: (string | null)[] = [];
  for (let i = 0; i < stopovers.length - 1; i++) {
    const arrival = stopovers[i + 1];
    legDayId.push(arrival.dayId ?? lastContentDayId);
    legAfterPoiId.push(stopovers[i].poiId);
  }

  return { waypoints, legDayId, legAfterPoiId };
}
```
> This keeps the prior behavior when no day has a night (nights just aren't inserted) and the existing build-route/itinerary tests still pass. The `arrival.dayId ?? lastContentDayId` handles the final leg into `end`.

- [ ] **Step 5: Run and confirm pass**

Run: `bun test tests/routing/build-route.test.ts` (new + existing pass), then `bun run test` (all pass).

- [ ] **Step 6: Commit**

```bash
git add lib/api/trips.ts lib/routing/itinerary-route.ts tests/routing/build-route.test.ts
git commit -m "feat: buildRoute inserts day nights as stopovers"
```

---

## Task 5: Night API routes + getTrip + fetchers + hooks

**Files:** modify `lib/trips/service.ts`, `lib/api/trips.ts`, `lib/itinerary/schema.ts`; create `app/api/days/[dayId]/night/route.ts`, `hooks/use-night-mutations.ts`.

- [ ] **Step 1: Include nights in `getTrip`** — in `lib/trips/service.ts`, change the `days` include so each day includes its night. The `days` include currently is `{ orderBy: { dayIndex: "asc" }, include: { pois: { orderBy: { orderInDay: "asc" } } } }`; add `night: true` to that inner `include`:
```ts
      days: {
        orderBy: { dayIndex: "asc" },
        include: { pois: { orderBy: { orderInDay: "asc" } }, night: true },
      },
```

- [ ] **Step 2: Night schemas** — append to `lib/itinerary/schema.ts`:
```ts
export const setNightSchema = z.object({
  lat: z.number(),
  lng: z.number(),
  title: z.string().nullable().optional(),
  url: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});
export const updateNightSchema = z.object({
  lat: z.number().optional(),
  lng: z.number().optional(),
  title: z.string().nullable().optional(),
  url: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});
```

- [ ] **Step 3: Create `app/api/days/[dayId]/night/route.ts`**
```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { setNight, updateNight, clearNight, ItineraryError } from "@/lib/itinerary/operations";
import { setNightSchema, updateNightSchema } from "@/lib/itinerary/schema";

type Ctx = { params: Promise<{ dayId: string }> };

export async function POST(req: Request, { params }: Ctx) {
  const { dayId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = setNightSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const night = await setNight(prisma, dayId, parsed.data);
  return NextResponse.json(night, { status: 201 });
}

export async function PATCH(req: Request, { params }: Ctx) {
  const { dayId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = updateNightSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const night = await updateNight(prisma, dayId, parsed.data);
    return NextResponse.json(night);
  } catch (e) {
    if (e instanceof ItineraryError) {
      return NextResponse.json({ error: e.message }, { status: 404 });
    }
    throw e;
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { dayId } = await params;
  await clearNight(prisma, dayId);
  return new NextResponse(null, { status: 204 });
}
```

- [ ] **Step 4: Client fetchers** — append to `lib/api/trips.ts`:
```ts
export async function setNightRequest(
  dayId: string,
  body: { lat: number; lng: number; title?: string | null; url?: string | null; notes?: string | null },
): Promise<void> {
  const res = await fetch(`/api/days/${dayId}/night`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Failed to set night (${res.status})`);
}

export async function updateNightRequest(
  dayId: string,
  patch: { lat?: number; lng?: number; title?: string | null; url?: string | null; notes?: string | null },
): Promise<void> {
  const res = await fetch(`/api/days/${dayId}/night`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`Failed to update night (${res.status})`);
}

export async function clearNightRequest(dayId: string): Promise<void> {
  const res = await fetch(`/api/days/${dayId}/night`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Failed to clear night (${res.status})`);
}
```

- [ ] **Step 5: Create `hooks/use-night-mutations.ts`**
```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { setNightRequest, updateNightRequest, clearNightRequest } from "@/lib/api/trips";
import { tripQueryKey } from "@/hooks/use-trip";
import { routeQueryKey } from "@/hooks/use-route";

function invalidate(qc: ReturnType<typeof useQueryClient>, tripId: string) {
  qc.invalidateQueries({ queryKey: tripQueryKey(tripId) });
  qc.invalidateQueries({ queryKey: routeQueryKey(tripId) });
}

export function useSetNight(tripId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { dayId: string; lat: number; lng: number; title?: string | null; url?: string | null; notes?: string | null }) =>
      setNightRequest(v.dayId, v),
    onSuccess: () => invalidate(qc, tripId),
  });
}

export function useUpdateNight(tripId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { dayId: string; lat?: number; lng?: number; title?: string | null; url?: string | null; notes?: string | null }) => {
      const { dayId, ...patch } = v;
      return updateNightRequest(dayId, patch);
    },
    onSuccess: () => invalidate(qc, tripId),
  });
}

export function useClearNight(tripId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dayId: string) => clearNightRequest(dayId),
    onSuccess: () => invalidate(qc, tripId),
  });
}
```

- [ ] **Step 6: Build + test**

Run: `bun run build` (success; `ƒ /api/days/[dayId]/night` listed) then `bun run test` (all pass).

- [ ] **Step 7: Commit**

```bash
git add lib/trips/service.ts lib/api/trips.ts lib/itinerary/schema.ts "app/api/days/[dayId]/night" hooks/use-night-mutations.ts
git commit -m "feat: night API routes + getTrip night + fetchers + hooks"
```

---

## Task 6: Map night markers + sidebar night block

**Files:** modify `components/trip-map.tsx`, `components/planner-shell.tsx`; create `components/day-night.tsx`.

- [ ] **Step 1: Add draggable night markers to `components/trip-map.tsx`**

(a) Add to the `TripMap` props (alongside `vias`/`onMoveVia`):
```tsx
  nights?: { dayId: string; lat: number; lng: number }[];
  onMoveNight?: (dayId: string, lat: number, lng: number) => void;
```
(b) After the vias `.map(...)` block (the amber diamonds), add night 🛏 markers:
```tsx
      {(nights ?? []).map((n) => (
        <AdvancedMarker
          key={n.dayId}
          position={{ lat: n.lat, lng: n.lng }}
          draggable
          onDragEnd={(e) => {
            const lat = e.latLng?.lat();
            const lng = e.latLng?.lng();
            if (lat != null && lng != null && onMoveNight) onMoveNight(n.dayId, lat, lng);
          }}
          title="Night stop (drag to move where you sleep)"
        >
          <div
            style={{
              fontSize: 18,
              lineHeight: "18px",
              cursor: "grab",
              filter: "drop-shadow(0 1px 1px rgba(0,0,0,.4))",
            }}
          >
            🛏️
          </div>
        </AdvancedMarker>
      ))}
```

- [ ] **Step 2: Create `components/day-night.tsx`** (the per-day sidebar block):
```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useSetNight, useUpdateNight, useClearNight } from "@/hooks/use-night-mutations";
import type { DayNight } from "@/lib/api/trips";

export function DayNight({
  tripId,
  dayId,
  night,
  fallback,
}: {
  tripId: string;
  dayId: string;
  night: DayNight | null;
  fallback: { lat: number; lng: number };
}) {
  const setNight = useSetNight(tripId);
  const updateNight = useUpdateNight(tripId);
  const clearNight = useClearNight(tripId);

  if (!night) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="mt-1 h-6 px-2 text-xs font-normal text-muted-foreground"
        disabled={setNight.isPending}
        onClick={() => setNight.mutate({ dayId, lat: fallback.lat, lng: fallback.lng })}
      >
        🛏️ Set night
      </Button>
    );
  }

  return <NightEditor tripId={tripId} dayId={dayId} night={night} onClear={() => clearNight.mutate(dayId)} updateNight={updateNight} />;
}

function NightEditor({
  dayId,
  night,
  onClear,
  updateNight,
}: {
  tripId: string;
  dayId: string;
  night: DayNight;
  onClear: () => void;
  updateNight: ReturnType<typeof useUpdateNight>;
}) {
  const [title, setTitle] = useState(night.title ?? "");
  const [url, setUrl] = useState(night.url ?? "");
  const [notes, setNotes] = useState(night.notes ?? "");

  return (
    <div className="mt-1 rounded-md border bg-muted/30 p-2 text-xs">
      <div className="mb-1 flex items-center justify-between">
        <span className="font-medium">🛏️ Night</span>
        <button type="button" className="text-muted-foreground hover:text-red-600" aria-label="Remove night" onClick={onClear}>
          ✕
        </button>
      </div>
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => updateNight.mutate({ dayId, title: title.trim() || null })}
        placeholder="Title (e.g. Parking near forest)"
        className="mb-1 h-7 text-xs"
      />
      <Input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onBlur={() => updateNight.mutate({ dayId, url: url.trim() || null })}
        placeholder="Link (Airbnb / Booking / campsite)"
        className="mb-1 h-7 text-xs"
      />
      {night.url ? (
        <a href={night.url} target="_blank" rel="noreferrer" className="mb-1 block truncate text-blue-600 underline">
          {night.url}
        </a>
      ) : null}
      <Textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={() => updateNight.mutate({ dayId, notes: notes.trim() || null })}
        placeholder="Notes"
        rows={2}
        className="text-xs"
      />
    </div>
  );
}
```

- [ ] **Step 3: Wire into `components/planner-shell.tsx`**

(a) Add imports:
```tsx
import { DayNight } from "@/components/day-night";
import { useUpdateNight } from "@/hooks/use-night-mutations";
```
(b) After the other hook calls (e.g. after `const removeVia = useRemoveVia(tripId);`), add:
```tsx
  const updateNight = useUpdateNight(tripId);
```
(c) Build the nights array for the map and pass it + `onMoveNight` into `<TripMap>` (add these two props to the existing usage):
```tsx
              nights={trip.days.filter((d) => d.night).map((d) => ({ dayId: d.id, lat: d.night!.lat, lng: d.night!.lng }))}
              onMoveNight={(dayId, lat, lng) => updateNight.mutate({ dayId, lat, lng })}
```
(d) Inside each day block, after the `<PoiContainer ... />`, render the night control. The day block currently ends with `<PoiContainer id={day.id} pois={byDay(day.id)} tripId={tripId} emptyText="Assign places from the list above." />`. Immediately after it (still inside the day's `<div>`), add:
```tsx
                  <DayNight
                    tripId={tripId}
                    dayId={day.id}
                    night={day.night}
                    fallback={(() => {
                      const stops = byDay(day.id);
                      const lastStop = stops[stops.length - 1];
                      return lastStop ? { lat: lastStop.lat, lng: lastStop.lng } : { lat: trip.startLat, lng: trip.startLng };
                    })()}
                  />
```

- [ ] **Step 4: Build + test**

Run: `bun run build` (success) then `bun run test` (all pass). If `AdvancedMarker onDragEnd` latLng typing differs, match the via diamond's working access (`e.latLng?.lat()`).

- [ ] **Step 5: Commit**

```bash
git add components/trip-map.tsx components/planner-shell.tsx components/day-night.tsx
git commit -m "feat: draggable night markers + per-day night editor (title/url/notes)"
```

---

## Task 7: Full verification

**Files:** none.

- [ ] **Step 1: Tests + build**

Run: `bun run test` (all pass incl. night ops + buildRoute night suites) and `bun run build` (success; `ƒ /api/days/[dayId]/night` present; no `isOvernight` anywhere).

- [ ] **Step 2: Manual smoke test** (dev server, real key, Routes API enabled)

Run `bun run dev`, open a trip with stops scheduled into ≥2 days, then:
1. Under **Day 1**, click **🛏️ Set night** → a 🛏️ marker appears on the map (at Day 1's last stop) and an editable block appears (title / link / notes).
2. **Drag the 🛏️ marker** on the map to a different spot → after it drops, **Day 1's and Day 2's 🚗 drive times change** (Day 1 now drives to the new sleep point; Day 2 starts from there).
3. Type a **title** ("Parking near forest"), paste a **URL** (it becomes a clickable link), add **notes** → all persist (reload to confirm).
4. **Remove** the night (✕) → the marker and block disappear; drive times revert.
5. The old 🌙 toggle on day-stop cards is **gone**.

Expected: all five. A 502 on a night move means the Routes API key issue.

- [ ] **Step 3: Final commit (notes, if any)**

```bash
git add -A
git commit -m "docs: night stops verified" --allow-empty
```

---

## Done — Definition of Done

- `bun run test` passes (adds night ops + buildRoute-night suites; overnight tests removed).
- `bun run build` succeeds with the night endpoint; no `isOvernight` remains.
- Each day can have one night stop (title/url/notes) shown as a draggable 🛏️ map marker; dragging it changes that day's and the next day's drive times (on drop); the old 🌙 overnight feature is fully removed.

**Deferred (noted):** `optimizeDay` anchors on the day's last stop (not re-pointed to the night); a route leg that *starts* at a night has no stop anchor, so adding a via exactly on a night→next-day leg anchors to "after start" (minor edge). Revisit if needed.
