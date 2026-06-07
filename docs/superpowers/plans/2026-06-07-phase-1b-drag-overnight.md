# Phase 1b — Drag/Drop + Overnights Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user organize a trip by hand — drag places between the unassigned pool and the per-day lists (and reorder within a day) with instant, optimistic UI, and mark one place per day as the overnight (🌙).

**Architecture:** Two new dependency-injected itinerary operations (`movePoi`, `setOvernight`) that re-index day ordering transactionally, exposed via a `PATCH /api/pois/[poiId]` route. Drag/drop uses the modern `@dnd-kit/react` + `@dnd-kit/helpers` `move` helper over a grouped record of POI ids. The risky reorder logic for the optimistic cache lives in a **pure, unit-tested** `applyMove(trip, poiId, dayId, index)` that mirrors the server's re-indexing, so drags feel instant and roll back on error.

**Tech Stack:** Next.js 16 + React 19, Prisma 7 (libSQL adapter), TanStack Query v5 (optimistic updates), `@dnd-kit/react@^0.4` + `@dnd-kit/helpers@^0.4`, Zod 4, Bun test runner.

---

## Context for the implementer (state after Phase 1a)

- Prisma 7: generated client imported from `@/lib/generated/prisma/client`; `Prisma` namespace too. Adapter `PrismaLibSql` from `@prisma/adapter-libsql`. DB tests instantiate their own client and run via `bun run test`.
- `lib/itinerary/operations.ts` already exports `ItineraryError`, `AddPoiInput`, `addPoi`, `removePoi`. `addPoi` already validates a supplied `dayId` belongs to the trip.
- `lib/itinerary/schema.ts` exports `addPoiSchema`, `AddPoiBody`.
- `app/api/pois/[poiId]/route.ts` already has `DELETE` (maps Prisma `P2025` → 404).
- `lib/api/trips.ts` exports types `TripDetail`, `DayDetail`, `PoiDetail` and fetchers `fetchTrip`, `postPoi`, `deletePoi`. `PoiDetail` has `{ id, name, lat, lng, placeId, category, source, isOvernight, dayId, orderInDay, status }`. `TripDetail` has `days: DayDetail[]` and a flat `pois: PoiDetail[]` (all POIs; `dayId=null` = pool).
- `hooks/use-trip.ts` exports `tripQueryKey(tripId)` and `useTrip(tripId)`. `hooks/use-poi-mutations.ts` exports `useAddPoi`, `useRemovePoi`.
- `components/planner-shell.tsx` (client) wraps the planner in `<APIProvider>`, renders the map + a sidebar that currently lists the pool (with remove) and per-day POIs (read-only, currently sourced from `trip.days[].pois`). `components/place-search.tsx` adds to the pool. `components/trip-map.tsx` renders pins.
- Git identity configured; NO AI co-author trailer in commits.

**Key refactor in this phase:** the planner will render each day's POIs and the pool from the **flat `trip.pois` array** (filter by `dayId`, sort by `orderInDay`) instead of from `trip.days[].pois`. This gives one source of truth that `applyMove` can update for optimistic drags.

---

## File Structure

```
lib/itinerary/operations.ts        (MODIFY) add movePoi, setOvernight
lib/itinerary/move.ts              (CREATE) pure applyMove for optimistic cache
lib/itinerary/schema.ts            (MODIFY) add patchPoiSchema (discriminated move|overnight)
app/api/pois/[poiId]/route.ts      (MODIFY) add PATCH
lib/api/trips.ts                   (MODIFY) add patchPoiMove, patchPoiOvernight
hooks/use-poi-mutations.ts         (MODIFY) add useMovePoi (optimistic), useSetOvernight
components/poi-card.tsx            (CREATE) sortable POI card (drag handle, 🌙, ✕)
components/poi-container.tsx       (CREATE) droppable list of POI cards
components/planner-shell.tsx       (MODIFY) DragDropProvider wiring + render via containers
tests/itinerary/operations.test.ts (MODIFY) movePoi + setOvernight cases
tests/itinerary/move.test.ts       (CREATE) applyMove cases
tests/itinerary/schema.test.ts     (MODIFY) patchPoiSchema cases
```

---

## Task 1: `movePoi` operation — TDD

**Files:** modify `lib/itinerary/operations.ts`; modify `tests/itinerary/operations.test.ts`.

- [ ] **Step 1: Add failing tests** — append inside `tests/itinerary/operations.test.ts` (after the existing `describe("removePoi", …)` block, before the file's final close). Also add `movePoi` to the import from `@/lib/itinerary/operations`:

Change the import line:
```ts
import { addPoi, removePoi, ItineraryError, movePoi } from "@/lib/itinerary/operations";
```
Append these tests:
```ts
describe("movePoi", () => {
  test("moves a pool POI into a day at the given index and re-indexes", async () => {
    const trip = await createTrip(prisma, sampleTrip());
    const dayId = trip.days[0].id;
    const a = await addPoi(prisma, trip.id, { name: "A", lat: 1, lng: 1, dayId });
    const b = await addPoi(prisma, trip.id, { name: "B", lat: 2, lng: 2, dayId });
    const c = await addPoi(prisma, trip.id, { name: "C", lat: 3, lng: 3 }); // pool

    await movePoi(prisma, c.id, { dayId, orderInDay: 1 });

    const inDay = await prisma.poi.findMany({
      where: { dayId },
      orderBy: { orderInDay: "asc" },
    });
    expect(inDay.map((p) => p.id)).toEqual([a.id, c.id, b.id]);
    expect(inDay.map((p) => p.orderInDay)).toEqual([0, 1, 2]);
  });

  test("moves a day POI to the pool, clearing day/order/overnight and re-indexing the source day", async () => {
    const trip = await createTrip(prisma, sampleTrip());
    const dayId = trip.days[0].id;
    const a = await addPoi(prisma, trip.id, { name: "A", lat: 1, lng: 1, dayId });
    const b = await addPoi(prisma, trip.id, { name: "B", lat: 2, lng: 2, dayId });

    await movePoi(prisma, a.id, { dayId: null, orderInDay: 0 });

    const moved = await prisma.poi.findUnique({ where: { id: a.id } });
    expect(moved?.dayId).toBeNull();
    expect(moved?.orderInDay).toBeNull();
    const remaining = await prisma.poi.findUnique({ where: { id: b.id } });
    expect(remaining?.orderInDay).toBe(0);
  });

  test("reorders within the same day", async () => {
    const trip = await createTrip(prisma, sampleTrip());
    const dayId = trip.days[0].id;
    const a = await addPoi(prisma, trip.id, { name: "A", lat: 1, lng: 1, dayId });
    const b = await addPoi(prisma, trip.id, { name: "B", lat: 2, lng: 2, dayId });
    const c = await addPoi(prisma, trip.id, { name: "C", lat: 3, lng: 3, dayId });

    await movePoi(prisma, c.id, { dayId, orderInDay: 0 });

    const inDay = await prisma.poi.findMany({ where: { dayId }, orderBy: { orderInDay: "asc" } });
    expect(inDay.map((p) => p.id)).toEqual([c.id, a.id, b.id]);
  });

  test("clamps an out-of-range index to the end of the day", async () => {
    const trip = await createTrip(prisma, sampleTrip());
    const dayId = trip.days[0].id;
    const a = await addPoi(prisma, trip.id, { name: "A", lat: 1, lng: 1, dayId });
    const c = await addPoi(prisma, trip.id, { name: "C", lat: 3, lng: 3 });

    await movePoi(prisma, c.id, { dayId, orderInDay: 99 });

    const inDay = await prisma.poi.findMany({ where: { dayId }, orderBy: { orderInDay: "asc" } });
    expect(inDay.map((p) => p.id)).toEqual([a.id, c.id]);
  });

  test("rejects moving into a day from a different trip", async () => {
    const tripA = await createTrip(prisma, sampleTrip());
    const tripB = await createTrip(prisma, sampleTrip());
    const poi = await addPoi(prisma, tripA.id, { name: "A", lat: 1, lng: 1 });
    await expect(
      movePoi(prisma, poi.id, { dayId: tripB.days[0].id, orderInDay: 0 }),
    ).rejects.toBeInstanceOf(ItineraryError);
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `bun run test`
Expected: movePoi suite fails (`movePoi` is not exported); other suites pass.

- [ ] **Step 3: Implement `movePoi`** — append to `lib/itinerary/operations.ts`:

```ts
export async function movePoi(
  prisma: PrismaClient,
  poiId: string,
  target: { dayId: string | null; orderInDay: number },
) {
  return prisma.$transaction(async (tx) => {
    const poi = await tx.poi.findUnique({ where: { id: poiId } });
    if (!poi) throw new ItineraryError("POI not found");
    const oldDayId = poi.dayId;
    const { dayId } = target;

    if (dayId) {
      const day = await tx.day.findFirst({ where: { id: dayId, tripId: poi.tripId } });
      if (!day) throw new ItineraryError("Day does not belong to this trip");
      const siblings = await tx.poi.findMany({
        where: { dayId, id: { not: poiId } },
        orderBy: { orderInDay: "asc" },
        select: { id: true },
      });
      const ids = siblings.map((s) => s.id);
      const index = Math.max(0, Math.min(target.orderInDay, ids.length));
      ids.splice(index, 0, poiId);
      for (let i = 0; i < ids.length; i++) {
        await tx.poi.update({ where: { id: ids[i] }, data: { dayId, orderInDay: i } });
      }
    } else {
      // moving to the unassigned pool: overnight makes no sense without a day
      await tx.poi.update({
        where: { id: poiId },
        data: { dayId: null, orderInDay: null, isOvernight: false },
      });
    }

    if (oldDayId && oldDayId !== dayId) {
      const src = await tx.poi.findMany({
        where: { dayId: oldDayId },
        orderBy: { orderInDay: "asc" },
        select: { id: true },
      });
      for (let i = 0; i < src.length; i++) {
        await tx.poi.update({ where: { id: src[i].id }, data: { orderInDay: i } });
      }
    }

    return tx.poi.findUnique({ where: { id: poiId } });
  });
}
```

- [ ] **Step 4: Run and confirm pass**

Run: `bun run test`
Expected: all suites pass including the 5 new movePoi cases.

- [ ] **Step 5: Commit**

```bash
git add lib/itinerary/operations.ts tests/itinerary/operations.test.ts
git commit -m "feat: add movePoi operation with transactional re-indexing"
```

---

## Task 2: `setOvernight` operation — TDD

**Files:** modify `lib/itinerary/operations.ts`; modify `tests/itinerary/operations.test.ts`.

- [ ] **Step 1: Add failing tests** — add `setOvernight` to the import line in `tests/itinerary/operations.test.ts`:
```ts
import { addPoi, removePoi, ItineraryError, movePoi, setOvernight } from "@/lib/itinerary/operations";
```
Append:
```ts
describe("setOvernight", () => {
  test("marks a day POI as the overnight", async () => {
    const trip = await createTrip(prisma, sampleTrip());
    const dayId = trip.days[0].id;
    const a = await addPoi(prisma, trip.id, { name: "A", lat: 1, lng: 1, dayId });
    await setOvernight(prisma, a.id, true);
    const got = await prisma.poi.findUnique({ where: { id: a.id } });
    expect(got?.isOvernight).toBe(true);
  });

  test("only one overnight per day — setting a second clears the first", async () => {
    const trip = await createTrip(prisma, sampleTrip());
    const dayId = trip.days[0].id;
    const a = await addPoi(prisma, trip.id, { name: "A", lat: 1, lng: 1, dayId });
    const b = await addPoi(prisma, trip.id, { name: "B", lat: 2, lng: 2, dayId });
    await setOvernight(prisma, a.id, true);
    await setOvernight(prisma, b.id, true);
    expect((await prisma.poi.findUnique({ where: { id: a.id } }))?.isOvernight).toBe(false);
    expect((await prisma.poi.findUnique({ where: { id: b.id } }))?.isOvernight).toBe(true);
  });

  test("unsetting overnight works", async () => {
    const trip = await createTrip(prisma, sampleTrip());
    const dayId = trip.days[0].id;
    const a = await addPoi(prisma, trip.id, { name: "A", lat: 1, lng: 1, dayId });
    await setOvernight(prisma, a.id, true);
    await setOvernight(prisma, a.id, false);
    expect((await prisma.poi.findUnique({ where: { id: a.id } }))?.isOvernight).toBe(false);
  });

  test("rejects marking a pool POI as overnight", async () => {
    const trip = await createTrip(prisma, sampleTrip());
    const a = await addPoi(prisma, trip.id, { name: "A", lat: 1, lng: 1 }); // pool
    await expect(setOvernight(prisma, a.id, true)).rejects.toBeInstanceOf(ItineraryError);
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `bun run test`
Expected: setOvernight suite fails (`setOvernight` not exported).

- [ ] **Step 3: Implement `setOvernight`** — append to `lib/itinerary/operations.ts`:

```ts
export async function setOvernight(
  prisma: PrismaClient,
  poiId: string,
  value: boolean,
) {
  const poi = await prisma.poi.findUnique({ where: { id: poiId } });
  if (!poi) throw new ItineraryError("POI not found");

  if (value) {
    if (!poi.dayId) {
      throw new ItineraryError("Only a place assigned to a day can be the overnight");
    }
    await prisma.$transaction([
      prisma.poi.updateMany({
        where: { dayId: poi.dayId, isOvernight: true },
        data: { isOvernight: false },
      }),
      prisma.poi.update({ where: { id: poiId }, data: { isOvernight: true } }),
    ]);
  } else {
    await prisma.poi.update({ where: { id: poiId }, data: { isOvernight: false } });
  }

  return prisma.poi.findUnique({ where: { id: poiId } });
}
```

- [ ] **Step 4: Run and confirm pass**

Run: `bun run test`
Expected: all suites pass including the 4 new setOvernight cases.

- [ ] **Step 5: Commit**

```bash
git add lib/itinerary/operations.ts tests/itinerary/operations.test.ts
git commit -m "feat: add setOvernight operation (one per day)"
```

---

## Task 3: Pure `applyMove` cache helper — TDD

**Files:** create `lib/itinerary/move.ts`; create `tests/itinerary/move.test.ts`.

> This mirrors `movePoi`'s re-indexing but on the in-memory `TripDetail` (flat `pois`). Used for the optimistic cache so a drag updates instantly.

- [ ] **Step 1: Write failing test** `tests/itinerary/move.test.ts`:

```ts
import { test, expect, describe } from "bun:test";
import { applyMove } from "@/lib/itinerary/move";
import type { TripDetail, PoiDetail } from "@/lib/api/trips";

function poi(id: string, dayId: string | null, orderInDay: number | null, extra: Partial<PoiDetail> = {}): PoiDetail {
  return {
    id, name: id, lat: 0, lng: 0, placeId: null, category: null,
    source: "user", isOvernight: false, dayId, orderInDay, status: "accepted", ...extra,
  };
}

function trip(pois: PoiDetail[]): TripDetail {
  return {
    id: "t", title: "T", description: "", startName: "S", startLat: 0, startLng: 0,
    endName: null, endLat: null, endLng: null, isRoundTrip: false,
    days: [
      { id: "d1", dayIndex: 0, pois: [] },
      { id: "d2", dayIndex: 1, pois: [] },
    ],
    pois,
  };
}

describe("applyMove", () => {
  test("inserts a pool POI into a day at an index and re-indexes", () => {
    const t = trip([poi("a", "d1", 0), poi("b", "d1", 1), poi("c", null, null)]);
    const out = applyMove(t, "c", "d1", 1);
    const inDay = out.pois.filter((p) => p.dayId === "d1").sort((x, y) => (x.orderInDay! - y.orderInDay!));
    expect(inDay.map((p) => p.id)).toEqual(["a", "c", "b"]);
    expect(inDay.map((p) => p.orderInDay)).toEqual([0, 1, 2]);
  });

  test("moving to the pool clears day/order/overnight and re-indexes the source day", () => {
    const t = trip([poi("a", "d1", 0, { isOvernight: true }), poi("b", "d1", 1)]);
    const out = applyMove(t, "a", null, 0);
    const a = out.pois.find((p) => p.id === "a")!;
    expect(a.dayId).toBeNull();
    expect(a.orderInDay).toBeNull();
    expect(a.isOvernight).toBe(false);
    expect(out.pois.find((p) => p.id === "b")!.orderInDay).toBe(0);
  });

  test("reorders within a day", () => {
    const t = trip([poi("a", "d1", 0), poi("b", "d1", 1), poi("c", "d1", 2)]);
    const out = applyMove(t, "c", "d1", 0);
    const inDay = out.pois.filter((p) => p.dayId === "d1").sort((x, y) => (x.orderInDay! - y.orderInDay!));
    expect(inDay.map((p) => p.id)).toEqual(["c", "a", "b"]);
  });

  test("returns the trip unchanged for an unknown poiId", () => {
    const t = trip([poi("a", "d1", 0)]);
    expect(applyMove(t, "zzz", "d2", 0)).toBe(t);
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `bun test tests/itinerary/move.test.ts`
Expected: FAIL — cannot resolve `@/lib/itinerary/move`.

- [ ] **Step 3: Implement `lib/itinerary/move.ts`**

```ts
import type { TripDetail, PoiDetail } from "@/lib/api/trips";

/**
 * Pure, optimistic mirror of the server `movePoi`: returns a new TripDetail with
 * `poiId` moved to `dayId` (null = pool) at `index`, re-indexing affected days.
 */
export function applyMove(
  trip: TripDetail,
  poiId: string,
  dayId: string | null,
  index: number,
): TripDetail {
  const moving = trip.pois.find((p) => p.id === poiId);
  if (!moving) return trip;
  const oldDayId = moving.dayId;

  const destOrder = new Map<string, number>();
  if (dayId !== null) {
    const ids = trip.pois
      .filter((p) => p.dayId === dayId && p.id !== poiId)
      .sort((a, b) => (a.orderInDay ?? 0) - (b.orderInDay ?? 0))
      .map((p) => p.id);
    const clamped = Math.max(0, Math.min(index, ids.length));
    ids.splice(clamped, 0, poiId);
    ids.forEach((id, i) => destOrder.set(id, i));
  }

  const srcOrder = new Map<string, number>();
  if (oldDayId && oldDayId !== dayId) {
    trip.pois
      .filter((p) => p.dayId === oldDayId && p.id !== poiId)
      .sort((a, b) => (a.orderInDay ?? 0) - (b.orderInDay ?? 0))
      .forEach((p, i) => srcOrder.set(p.id, i));
  }

  const pois: PoiDetail[] = trip.pois.map((p) => {
    if (p.id === poiId) {
      return dayId === null
        ? { ...p, dayId: null, orderInDay: null, isOvernight: false }
        : { ...p, dayId, orderInDay: destOrder.get(p.id) ?? 0 };
    }
    if (destOrder.has(p.id)) return { ...p, orderInDay: destOrder.get(p.id)! };
    if (srcOrder.has(p.id)) return { ...p, orderInDay: srcOrder.get(p.id)! };
    return p;
  });

  return { ...trip, pois };
}
```

- [ ] **Step 4: Run and confirm pass**

Run: `bun test tests/itinerary/move.test.ts`
Expected: PASS (4 cases).

- [ ] **Step 5: Commit**

```bash
git add lib/itinerary/move.ts tests/itinerary/move.test.ts
git commit -m "feat: add pure applyMove cache helper with tests"
```

---

## Task 4: PATCH schema + route

**Files:** modify `lib/itinerary/schema.ts`, `tests/itinerary/schema.test.ts`, `app/api/pois/[poiId]/route.ts`.

- [ ] **Step 1: Add failing schema tests** — append to `tests/itinerary/schema.test.ts` (and add the import):
```ts
import { addPoiSchema, patchPoiSchema } from "@/lib/itinerary/schema";
```
Append:
```ts
describe("patchPoiSchema", () => {
  test("accepts a move op (day target)", () => {
    expect(patchPoiSchema.safeParse({ op: "move", dayId: "d1", orderInDay: 2 }).success).toBe(true);
  });
  test("accepts a move op to the pool (null day)", () => {
    expect(patchPoiSchema.safeParse({ op: "move", dayId: null, orderInDay: 0 }).success).toBe(true);
  });
  test("accepts an overnight op", () => {
    expect(patchPoiSchema.safeParse({ op: "overnight", isOvernight: true }).success).toBe(true);
  });
  test("rejects an unknown op", () => {
    expect(patchPoiSchema.safeParse({ op: "bogus" }).success).toBe(false);
  });
  test("rejects a negative orderInDay", () => {
    expect(patchPoiSchema.safeParse({ op: "move", dayId: "d1", orderInDay: -1 }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `bun test tests/itinerary/schema.test.ts`
Expected: FAIL — `patchPoiSchema` not exported.

- [ ] **Step 3: Implement schema** — append to `lib/itinerary/schema.ts`:
```ts
export const patchPoiSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("move"),
    dayId: z.string().nullable(),
    orderInDay: z.number().int().min(0),
  }),
  z.object({
    op: z.literal("overnight"),
    isOvernight: z.boolean(),
  }),
]);

export type PatchPoiBody = z.infer<typeof patchPoiSchema>;
```

- [ ] **Step 4: Run and confirm pass**

Run: `bun test tests/itinerary/schema.test.ts`
Expected: PASS (5 new cases).

- [ ] **Step 5: Add `PATCH` to `app/api/pois/[poiId]/route.ts`** — update imports and append the handler. The file currently imports `removePoi`; change it to also import `movePoi`, `setOvernight`, `ItineraryError`, and the schema:
```ts
import { removePoi, movePoi, setOvernight, ItineraryError } from "@/lib/itinerary/operations";
import { patchPoiSchema } from "@/lib/itinerary/schema";
```
Append this handler:
```ts
export async function PATCH(req: Request, { params }: Ctx) {
  const { poiId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = patchPoiSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;
  try {
    const poi =
      data.op === "move"
        ? await movePoi(prisma, poiId, { dayId: data.dayId, orderInDay: data.orderInDay })
        : await setOvernight(prisma, poiId, data.isOvernight);
    return NextResponse.json(poi);
  } catch (e) {
    if (e instanceof ItineraryError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    throw e;
  }
}
```
(The `Prisma` namespace and `prisma`/`NextResponse`/`Ctx` are already imported in this file from Phase 1a.)

- [ ] **Step 6: Verify build + tests**

Run: `bun run build` (expect success; `ƒ /api/pois/[poiId]` still listed) then `bun run test` (all pass).

- [ ] **Step 7: Commit**

```bash
git add lib/itinerary/schema.ts tests/itinerary/schema.test.ts app/api/pois/[poiId]/route.ts
git commit -m "feat: add PATCH /api/pois/[poiId] (move + overnight)"
```

---

## Task 5: Client fetchers + optimistic mutation hooks

**Files:** modify `lib/api/trips.ts`, `hooks/use-poi-mutations.ts`.

- [ ] **Step 1: Add client fetchers** — append to `lib/api/trips.ts`:
```ts
export async function patchPoiMove(
  poiId: string,
  dayId: string | null,
  orderInDay: number,
): Promise<PoiDetail> {
  const res = await fetch(`/api/pois/${poiId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ op: "move", dayId, orderInDay }),
  });
  if (!res.ok) throw new Error(`Failed to move place (${res.status})`);
  return res.json();
}

export async function patchPoiOvernight(
  poiId: string,
  isOvernight: boolean,
): Promise<PoiDetail> {
  const res = await fetch(`/api/pois/${poiId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ op: "overnight", isOvernight }),
  });
  if (!res.ok) throw new Error(`Failed to set overnight (${res.status})`);
  return res.json();
}
```

- [ ] **Step 2: Add mutation hooks** — modify `hooks/use-poi-mutations.ts`. Update imports at the top:
```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  postPoi,
  deletePoi,
  patchPoiMove,
  patchPoiOvernight,
  type TripDetail,
} from "@/lib/api/trips";
import type { AddPoiBody } from "@/lib/itinerary/schema";
import { applyMove } from "@/lib/itinerary/move";
import { tripQueryKey } from "@/hooks/use-trip";
```
Append these hooks (keep the existing `useAddPoi`/`useRemovePoi`):
```ts
export function useMovePoi(tripId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { poiId: string; dayId: string | null; orderInDay: number }) =>
      patchPoiMove(v.poiId, v.dayId, v.orderInDay),
    onMutate: async (v) => {
      const key = tripQueryKey(tripId);
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<TripDetail>(key);
      if (prev) qc.setQueryData<TripDetail>(key, applyMove(prev, v.poiId, v.dayId, v.orderInDay));
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(tripQueryKey(tripId), ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: tripQueryKey(tripId) }),
  });
}

export function useSetOvernight(tripId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { poiId: string; isOvernight: boolean }) =>
      patchPoiOvernight(v.poiId, v.isOvernight),
    onSuccess: () => qc.invalidateQueries({ queryKey: tripQueryKey(tripId) }),
  });
}
```

- [ ] **Step 3: Verify build**

Run: `bun run build`
Expected: success.

- [ ] **Step 4: Commit**

```bash
git add lib/api/trips.ts hooks/use-poi-mutations.ts
git commit -m "feat: add optimistic move + overnight mutation hooks"
```

---

## Task 6: Sortable POI card + droppable container

**Files:** create `components/poi-card.tsx`, `components/poi-container.tsx`.

- [ ] **Step 1: Add dnd-kit dependencies**

Run: `bun add @dnd-kit/react @dnd-kit/helpers`
Note the resolved versions in your report (expect ^0.4.x).

- [ ] **Step 2: Create `components/poi-card.tsx`**

> Uses `useSortable` from `@dnd-kit/react/sortable`. A dedicated drag **handle** keeps the ✕ / 🌙 buttons clickable (clicking them must not start a drag). Verify the hook's returned fields against the installed version: it returns a `ref` for the element and a `handleRef` for the handle, plus `isDragging`. If a field name differs in `@dnd-kit/react@0.4`, adjust the destructuring to match — keep the behavior (whole card sortable, drag only from the handle).

```tsx
"use client";

import { useSortable } from "@dnd-kit/react/sortable";
import { Button } from "@/components/ui/button";
import { useRemovePoi, useSetOvernight } from "@/hooks/use-poi-mutations";
import type { PoiDetail } from "@/lib/api/trips";

export function PoiCard({
  poi,
  index,
  group,
  tripId,
}: {
  poi: PoiDetail;
  index: number;
  group: string;
  tripId: string;
}) {
  const { ref, handleRef, isDragging } = useSortable({
    id: poi.id,
    index,
    group,
    type: "poi",
    accept: "poi",
  });
  const removePoi = useRemovePoi(tripId);
  const setOvernight = useSetOvernight(tripId);
  const inDay = group !== "pool";

  return (
    <li
      ref={ref}
      className={`flex items-center gap-2 rounded-md border bg-background px-2 py-2 text-sm ${
        isDragging ? "opacity-50" : ""
      }`}
    >
      <span
        ref={handleRef}
        aria-label="Drag to reorder"
        className="cursor-grab select-none px-1 text-muted-foreground"
      >
        ⠿
      </span>
      <span className="flex-1 truncate">
        {poi.isOvernight ? "🌙 " : ""}
        {poi.name}
      </span>
      {inDay && (
        <Button
          variant="ghost"
          size="sm"
          aria-label={poi.isOvernight ? `Unset overnight for ${poi.name}` : `Set ${poi.name} as overnight`}
          onClick={() => setOvernight.mutate({ poiId: poi.id, isOvernight: !poi.isOvernight })}
        >
          🌙
        </Button>
      )}
      <Button
        variant="ghost"
        size="sm"
        aria-label={`Remove ${poi.name}`}
        onClick={() => removePoi.mutate(poi.id)}
      >
        ✕
      </Button>
    </li>
  );
}
```

- [ ] **Step 3: Create `components/poi-container.tsx`**

> Makes the list itself a drop target so you can drop into an empty day. Verify `useDroppable` signature against `@dnd-kit/react@0.4` (id + optional type/accept); adjust if needed.

```tsx
"use client";

import { useDroppable } from "@dnd-kit/react";
import { PoiCard } from "@/components/poi-card";
import type { PoiDetail } from "@/lib/api/trips";

export function PoiContainer({
  id,
  pois,
  tripId,
  emptyText,
}: {
  id: string;
  pois: PoiDetail[];
  tripId: string;
  emptyText: string;
}) {
  const { ref } = useDroppable({ id, type: "poi", accept: "poi" });
  return (
    <ul ref={ref} className="min-h-10 space-y-1">
      {pois.length === 0 ? (
        <li className="px-1 py-2 text-xs text-muted-foreground">{emptyText}</li>
      ) : (
        pois.map((p, i) => (
          <PoiCard key={p.id} poi={p} index={i} group={id} tripId={tripId} />
        ))
      )}
    </ul>
  );
}
```

- [ ] **Step 4: Verify build**

Run: `bun run build`
Expected: success. Fix any `@dnd-kit/react@0.4` field/signature mismatches (access-only) until green.

- [ ] **Step 5: Commit**

```bash
git add components/poi-card.tsx components/poi-container.tsx package.json bun.lock
git commit -m "feat: add sortable POI card and droppable container"
```

---

## Task 7: Wire drag/drop into the planner

**Files:** modify `components/planner-shell.tsx`.

> Wrap the sidebar in `<DragDropProvider>`, derive a grouped record of POI ids (`{ pool: [...], [dayId]: [...] }`) from the flat `trip.pois`, render the pool and each day via `PoiContainer`, and on drag end use the `move` helper to compute the new arrangement, then fire the optimistic `useMovePoi`. Per-day and pool lists now come from the flat `trip.pois`.

- [ ] **Step 1: Rewrite `components/planner-shell.tsx`**

```tsx
"use client";

import { APIProvider } from "@vis.gl/react-google-maps";
import { DragDropProvider } from "@dnd-kit/react";
import { move } from "@dnd-kit/helpers";
import { TripMap, type MapPoint } from "@/components/trip-map";
import { PlaceSearch } from "@/components/place-search";
import { PoiContainer } from "@/components/poi-container";
import { useTrip } from "@/hooks/use-trip";
import { useAddPoi, useMovePoi } from "@/hooks/use-poi-mutations";
import type { AddPoiInput } from "@/lib/itinerary/operations";

export function PlannerShell({ tripId }: { tripId: string }) {
  const { data: trip, isLoading, isError } = useTrip(tripId);
  const addPoi = useAddPoi(tripId);
  const movePoi = useMovePoi(tripId);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-muted-foreground">
        Loading trip…
      </div>
    );
  }
  if (isError || !trip) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-red-600">
        Couldn’t load this trip.
      </div>
    );
  }

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
  const start: MapPoint = { lat: trip.startLat, lng: trip.startLng, name: trip.startName };
  const end: MapPoint | null =
    trip.endLat != null && trip.endLng != null
      ? { lat: trip.endLat, lng: trip.endLng, name: trip.endName ?? "End" }
      : null;
  const poiPoints: MapPoint[] = trip.pois.map((p) => ({
    lat: p.lat,
    lng: p.lng,
    name: p.name,
    id: p.id,
  }));

  const byDay = (dayId: string | null) =>
    trip.pois
      .filter((p) => p.dayId === dayId)
      .sort((a, b) => (a.orderInDay ?? 0) - (b.orderInDay ?? 0));
  const pool = byDay(null);

  // Grouped record of POI ids for the dnd-kit `move` helper.
  const groups: Record<string, string[]> = { pool: pool.map((p) => p.id) };
  for (const day of trip.days) groups[day.id] = byDay(day.id).map((p) => p.id);

  function handleAddFromMap(input: AddPoiInput) {
    addPoi.mutate({
      name: input.name,
      lat: input.lat,
      lng: input.lng,
      placeId: input.placeId ?? undefined,
      category: input.category ?? undefined,
      source: "map",
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function onDragEnd(event: any) {
    if (event.canceled) return;
    const poiId = event.operation?.source?.id;
    if (poiId == null) return;
    const next = move(groups, event) as Record<string, string[]>;
    let destKey: string | undefined;
    let destIndex = 0;
    for (const [key, ids] of Object.entries(next)) {
      const i = ids.indexOf(poiId);
      if (i !== -1) {
        destKey = key;
        destIndex = i;
        break;
      }
    }
    if (!destKey) return;
    movePoi.mutate({
      poiId: String(poiId),
      dayId: destKey === "pool" ? null : destKey,
      orderInDay: destIndex,
    });
  }

  return (
    <APIProvider apiKey={apiKey}>
      <DragDropProvider onDragEnd={onDragEnd}>
        <div className="flex h-screen w-full">
          <div className="relative flex-1">
            {apiKey ? (
              <TripMap start={start} end={end} pois={poiPoints} onAddPlace={handleAddFromMap} />
            ) : (
              <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
                Set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to enable the map and place search.
              </div>
            )}
          </div>

          <aside className="flex w-80 shrink-0 flex-col overflow-y-auto border-l p-4">
            <h2 className="mb-1 text-lg font-semibold">{trip.title}</h2>
            <p className="mb-4 text-sm text-muted-foreground">
              {trip.startName}
              {end ? ` → ${end.name}` : " (round trip)"}
            </p>

            <div className="mb-4">
              <PlaceSearch tripId={tripId} />
            </div>

            <div className="mb-4">
              <div className="mb-2 text-sm font-medium">Unassigned places ({pool.length})</div>
              <PoiContainer
                id="pool"
                pois={pool}
                tripId={tripId}
                emptyText="Search above or click a place on the map to add it."
              />
            </div>

            <div className="space-y-3">
              {trip.days.map((day) => (
                <div key={day.id} className="rounded-md border p-3">
                  <div className="mb-2 text-sm font-medium">Day {day.dayIndex + 1}</div>
                  <PoiContainer
                    id={day.id}
                    pois={byDay(day.id)}
                    tripId={tripId}
                    emptyText="Drag places here."
                  />
                </div>
              ))}
            </div>
          </aside>
        </div>
      </DragDropProvider>
    </APIProvider>
  );
}
```

- [ ] **Step 2: Verify build + tests**

Run: `bun run build` (success) then `bun run test` (all pass). If `event.operation.source.id` is shaped differently in `@dnd-kit/react@0.4`, adjust how `poiId` is read (the dragged item's id) — verify against the installed types; the behavior (move that POI to the container/index it was dropped in) must hold.

- [ ] **Step 3: Commit**

```bash
git add components/planner-shell.tsx
git commit -m "feat: drag/drop POIs between days and pool with optimistic updates"
```

---

## Task 8: Full verification

**Files:** none.

- [ ] **Step 1: Tests + build**

Run: `bun run test` (all suites pass: movePoi, setOvernight, applyMove, patchPoiSchema + prior) and `bun run build` (success).

- [ ] **Step 2: Manual smoke test** (dev server, real Google key already in `.env`)

Run `bun run dev`, open a trip with a few places in the pool, then:
1. **Drag** a pool place into **Day 1** → it moves instantly (optimistic), appears under Day 1, leaves the pool.
2. **Drag** a second place into Day 1 and **reorder** them within the day → order updates instantly.
3. **Drag** a Day 1 place back to the **pool** → it returns to the pool; remaining Day 1 places re-number.
4. Click **🌙** on a Day 1 place → it shows the moon; click 🌙 on another in the same day → the first one's moon clears (one per day).
5. **Reload** → all day assignments, ordering, and the overnight persist.
6. Drag a place to a day, mark overnight, then drag it to the pool → its overnight clears.

Expected: all six behave as described, with no flicker/rollback (rollback only on a real server error).

- [ ] **Step 3: Final commit (notes, if any)**

```bash
git add -A
git commit -m "docs: phase 1b verified" --allow-empty
```

---

## Phase 1b Done — Definition of Done

- `bun run test` passes (adds movePoi, setOvernight, applyMove, patchPoiSchema cases).
- `bun run build` succeeds.
- The user can drag places between the pool and days, reorder within a day (instant/optimistic, rollback on error), and mark one overnight (🌙) per day — all persisted.
- The full manual planner is complete. **Next: the dedicated visual design pass (frontend-design), then Phase 2 (routing engine + real road route + drive time).**
