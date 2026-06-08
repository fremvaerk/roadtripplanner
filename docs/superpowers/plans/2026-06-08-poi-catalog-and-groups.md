# POI Catalog & Groups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the POI list a persistent master catalog organized into user-named groups, where assigning a POI to a day is an attribute (it stays in the list) rather than a move.

**Architecture:** Add a `PoiGroup` model and `groupId`/`orderInGroup` on `Poi` (additive). Day assignment keeps reusing `movePoi`. The right dock becomes a grouped **master list** (all POIs, always) above the existing **day columns**; a POI scheduled on a day shows in both. Day assignment is done via a per-row **day-badge `<select>`**; groups are reorder/refile via a dedicated dnd provider for the master list; the itinerary keeps its own dnd provider for within/between-day dragging.

**Tech Stack:** Next.js 16 + React 19, Prisma 7 (libSQL), TanStack Query v5, `@dnd-kit/react` + `@dnd-kit/helpers`, Bun test runner.

---

## Context for the implementer (current state)

- Prisma `Poi` has `id, tripId, dayId?, orderInDay?, isOvernight, name, lat, lng, placeId?, category?, source, status, …`. `Trip` has `days Day[]`, `pois Poi[]`. Generated client at `@/lib/generated/prisma/client`; libSQL adapter; interactive `$transaction(async tx => …)` works; DB tests via `bun run test`.
- `lib/itinerary/operations.ts` exports `ItineraryError`, `addPoi(prisma, tripId, input)`, `removePoi`, `movePoi(prisma, poiId, { dayId, orderInDay })` (transactional re-index; clears `isOvernight` on cross-day/pool move; validates day belongs to trip), `setOvernight`, `optimizeDay`. `lib/itinerary/schema.ts` exports `addPoiSchema`, `patchPoiSchema` (discriminated `op: "move" | "overnight"`).
- `lib/trips/service.ts` `getTrip` returns trip incl. `days` (ordered, nested ordered pois) and flat `pois`. `lib/api/trips.ts` exports `TripDetail`, `DayDetail`, `PoiDetail`, fetchers (`fetchTrip`, `postPoi`, `deletePoi`, `patchPoiMove`, `patchPoiOvernight`, `optimizeDayRequest`, `buildSplitRequest`, `resplitRequest`). `hooks/use-poi-mutations.ts` exports `useAddPoi`, `useRemovePoi`, `useMovePoi`, `useSetOvernight`, `useOptimizeDay`, `useBuildSplit`, `useResplit`; `hooks/use-trip.ts` → `tripQueryKey`; `hooks/use-route.ts` → `routeQueryKey`.
- `components/planner-shell.tsx` wraps the planner in `<APIProvider>` + a single `<DragDropProvider>` and renders: map; a sidebar with `<PlaceSearch>`, the pool `<PoiContainer id="pool">`, the Build/Re-split buttons, and per-day blocks each with a `<PoiContainer id={day.id}>`. `components/poi-container.tsx` = `useDroppable` list of `components/poi-card.tsx`. `components/poi-card.tsx` = `useSortable` card with drag handle, name (🌙 prefix), overnight toggle (day cards), remove ✕ (calls `useRemovePoi`).
- `@dnd-kit/react`: `DragDropProvider`, `useSortable` (`{ id, index, group, type, accept }` → `{ ref, handleRef, isDragging }`), `useDroppable` (`{ id, type, accept }` → `{ ref }`), `move(groups, event)` helper over `Record<string, string[]>`; `event.operation?.source?.id`, `event.canceled`.
- Git identity configured; NO AI co-author trailer.

**Scope note:** This plan delivers day-assignment via the per-row **badge select** (robust). The *drag gesture* from master list → day is intentionally deferred (it needs the same POI as two draggable items in one provider; high-risk). Functionality (assign while keeping the POI in the list) is fully covered by the badge + the day card's remove-from-day.

---

## File Structure

```
prisma/schema.prisma                 (MODIFY) PoiGroup model + Poi.groupId/orderInGroup + Trip.poiGroups
lib/itinerary/operations.ts          (MODIFY) addPoi gains groupId; + group ops + moveToGroup
lib/itinerary/schema.ts              (MODIFY) addPoiSchema groupId; createGroupSchema; patchPoiSchema "group" op
lib/trips/service.ts                 (MODIFY) getTrip includes poiGroups
lib/api/trips.ts                     (MODIFY) TripGroup type, PoiDetail group fields, group fetchers
app/api/trips/[tripId]/groups/route.ts        (CREATE) POST create, PUT reorder
app/api/groups/[groupId]/route.ts             (CREATE) PATCH rename, DELETE
app/api/pois/[poiId]/route.ts        (MODIFY) PATCH gains "group" op
hooks/use-group-mutations.ts         (CREATE) useCreateGroup/useRenameGroup/useDeleteGroup/useReorderGroups/useMoveToGroup
components/catalog-row.tsx           (CREATE) master-list POI row (sortable, day-badge select, delete)
components/group-section.tsx         (CREATE) droppable group container of catalog rows
components/master-list.tsx           (CREATE) grouped list + its own DragDropProvider + New group
components/planner-shell.tsx         (MODIFY) render <MasterList> above day columns; itinerary keeps its provider
tests/itinerary/groups.test.ts       (CREATE)
tests/itinerary/move-to-group.test.ts(CREATE)
tests/itinerary/operations.test.ts   (MODIFY) addPoi groupId case
```

---

## Task 1: Schema — PoiGroup + group fields

**Files:** modify `prisma/schema.prisma`.

- [ ] **Step 1: Edit `prisma/schema.prisma`** — add the new model, two `Poi` fields + relation, and the `Trip` back-relation.

Add to the `Trip` model (alongside `days`/`pois`):
```prisma
  poiGroups PoiGroup[]
```
Add to the `Poi` model (after `category`):
```prisma
  groupId      String?
  group        PoiGroup? @relation(fields: [groupId], references: [id], onDelete: SetNull)
  orderInGroup Int?
```
Add the new model:
```prisma
model PoiGroup {
  id         String   @id @default(cuid())
  tripId     String
  trip       Trip     @relation(fields: [tripId], references: [id], onDelete: Cascade)
  name       String
  orderIndex Int
  createdAt  DateTime @default(now())
  pois       Poi[]

  @@unique([tripId, orderIndex])
}
```

- [ ] **Step 2: Push schema + regenerate**

Run:
```bash
bunx prisma db push
```
Expected: applies the new column/table; `lib/generated/prisma` regenerated. (`db push` runs `generate` per project config; if not, run `bunx prisma generate`.)

- [ ] **Step 3: Confirm tables**

Run: `sqlite3 prisma/dev.db ".tables"`
Expected: lists `PoiGroup` alongside `Trip Day Poi`.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat: add PoiGroup model and Poi group fields"
```

---

## Task 2: `addPoi` gains `groupId` — TDD

**Files:** modify `lib/itinerary/operations.ts`, `tests/itinerary/operations.test.ts`.

- [ ] **Step 1: Add a failing test** — append inside `tests/itinerary/operations.test.ts` (in the `describe("addPoi", …)` block, before its closing `});`):
```ts
  test("files a POI into a group with the next orderInGroup", async () => {
    const trip = await createTrip(prisma, sampleTrip());
    const group = await prisma.poiGroup.create({
      data: { tripId: trip.id, name: "Wineries", orderIndex: 0 },
    });
    const a = await addPoi(prisma, trip.id, { name: "A", lat: 1, lng: 1, groupId: group.id });
    const b = await addPoi(prisma, trip.id, { name: "B", lat: 2, lng: 2, groupId: group.id });
    expect(a.groupId).toBe(group.id);
    expect(a.orderInGroup).toBe(0);
    expect(b.orderInGroup).toBe(1);
  });

  test("ungrouped POIs get an orderInGroup within the ungrouped bucket", async () => {
    const trip = await createTrip(prisma, sampleTrip());
    const a = await addPoi(prisma, trip.id, { name: "A", lat: 1, lng: 1 });
    expect(a.groupId).toBeNull();
    expect(a.orderInGroup).toBe(0);
  });
```

- [ ] **Step 2: Run and confirm failure**

Run: `bun run test`
Expected: the two new addPoi cases fail (`orderInGroup` is null / `groupId` not set).

- [ ] **Step 3: Implement** — in `lib/itinerary/operations.ts`, update `AddPoiInput` and `addPoi`. Add `groupId?: string | null` to `AddPoiInput`. In `addPoi`, compute `orderInGroup` as the count in the target group bucket and set `groupId`:
```ts
  let orderInGroup = await prisma.poi.count({
    where: { tripId, groupId: input.groupId ?? null },
  });
```
and add to the `prisma.poi.create({ data: { … } })` object:
```ts
      groupId: input.groupId ?? null,
      orderInGroup,
```
(Keep all existing fields, incl. the day/orderInDay logic, unchanged.)

- [ ] **Step 4: Run and confirm pass**

Run: `bun run test`
Expected: all pass including the 2 new cases.

- [ ] **Step 5: Commit**

```bash
git add lib/itinerary/operations.ts tests/itinerary/operations.test.ts
git commit -m "feat: addPoi files POIs into groups with ordering"
```

---

## Task 3: Group CRUD operations — TDD

**Files:** modify `lib/itinerary/operations.ts`; test `tests/itinerary/groups.test.ts`.

- [ ] **Step 1: Write the failing test** `tests/itinerary/groups.test.ts`:
```ts
import { test, expect, describe, beforeEach, afterAll } from "bun:test";
import { PrismaClient } from "@/lib/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import {
  createGroup,
  renameGroup,
  deleteGroup,
  reorderGroups,
  addPoi,
} from "@/lib/itinerary/operations";
import { createTrip } from "@/lib/trips/service";
import type { CreateTripData } from "@/lib/trips/schema";

const prisma = new PrismaClient({
  adapter: new PrismaLibSql({ url: process.env.DATABASE_URL ?? "file:./test.db" }),
});

beforeEach(async () => {
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

describe("group CRUD", () => {
  test("createGroup assigns sequential orderIndex", async () => {
    const trip = await createTrip(prisma, sampleTrip());
    const g0 = await createGroup(prisma, trip.id, "Wineries");
    const g1 = await createGroup(prisma, trip.id, "Sights");
    expect(g0.orderIndex).toBe(0);
    expect(g1.orderIndex).toBe(1);
  });

  test("renameGroup changes the name", async () => {
    const trip = await createTrip(prisma, sampleTrip());
    const g = await createGroup(prisma, trip.id, "Old");
    const r = await renameGroup(prisma, g.id, "New");
    expect(r.name).toBe("New");
  });

  test("deleteGroup reassigns its POIs to ungrouped (groupId null) and removes the group", async () => {
    const trip = await createTrip(prisma, sampleTrip());
    const g = await createGroup(prisma, trip.id, "Temp");
    const p = await addPoi(prisma, trip.id, { name: "P", lat: 1, lng: 1, groupId: g.id });
    await deleteGroup(prisma, g.id);
    expect(await prisma.poiGroup.findUnique({ where: { id: g.id } })).toBeNull();
    const fresh = await prisma.poi.findUnique({ where: { id: p.id } });
    expect(fresh?.groupId).toBeNull();
  });

  test("reorderGroups sets orderIndex from the given id order", async () => {
    const trip = await createTrip(prisma, sampleTrip());
    const a = await createGroup(prisma, trip.id, "A");
    const b = await createGroup(prisma, trip.id, "B");
    await reorderGroups(prisma, trip.id, [b.id, a.id]);
    expect((await prisma.poiGroup.findUnique({ where: { id: b.id } }))?.orderIndex).toBe(0);
    expect((await prisma.poiGroup.findUnique({ where: { id: a.id } }))?.orderIndex).toBe(1);
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `bun run test`
Expected: groups suite fails (exports missing).

- [ ] **Step 3: Implement** — append to `lib/itinerary/operations.ts`:
```ts
export async function createGroup(prisma: PrismaClient, tripId: string, name: string) {
  const orderIndex = await prisma.poiGroup.count({ where: { tripId } });
  return prisma.poiGroup.create({ data: { tripId, name, orderIndex } });
}

export async function renameGroup(prisma: PrismaClient, groupId: string, name: string) {
  return prisma.poiGroup.update({ where: { id: groupId }, data: { name } });
}

export async function deleteGroup(prisma: PrismaClient, groupId: string) {
  return prisma.$transaction(async (tx) => {
    await tx.poi.updateMany({ where: { groupId }, data: { groupId: null } });
    return tx.poiGroup.delete({ where: { id: groupId } });
  });
}

export async function reorderGroups(
  prisma: PrismaClient,
  tripId: string,
  orderedIds: string[],
) {
  return prisma.$transaction(async (tx) => {
    // two-phase to avoid the @@unique([tripId, orderIndex]) collision
    for (let i = 0; i < orderedIds.length; i++) {
      await tx.poiGroup.update({
        where: { id: orderedIds[i] },
        data: { orderIndex: 1000 + i },
      });
    }
    for (let i = 0; i < orderedIds.length; i++) {
      await tx.poiGroup.update({ where: { id: orderedIds[i] }, data: { orderIndex: i } });
    }
  });
}
```
> The two-phase renumber avoids violating `@@unique([tripId, orderIndex])` mid-update.

- [ ] **Step 4: Run and confirm pass**

Run: `bun run test`
Expected: all pass including the 4 group cases.

- [ ] **Step 5: Commit**

```bash
git add lib/itinerary/operations.ts tests/itinerary/groups.test.ts
git commit -m "feat: add group CRUD operations with tests"
```

---

## Task 4: `moveToGroup` operation — TDD

**Files:** modify `lib/itinerary/operations.ts`; test `tests/itinerary/move-to-group.test.ts`.

> Refile a POI into a group (or ungrouped) at an index, re-indexing the destination group bucket and the source bucket. Validates a non-null group belongs to the POI's trip.

- [ ] **Step 1: Write the failing test** `tests/itinerary/move-to-group.test.ts`:
```ts
import { test, expect, describe, beforeEach, afterAll } from "bun:test";
import { PrismaClient } from "@/lib/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { createGroup, moveToGroup, addPoi, ItineraryError } from "@/lib/itinerary/operations";
import { createTrip } from "@/lib/trips/service";
import type { CreateTripData } from "@/lib/trips/schema";

const prisma = new PrismaClient({
  adapter: new PrismaLibSql({ url: process.env.DATABASE_URL ?? "file:./test.db" }),
});

beforeEach(async () => {
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

describe("moveToGroup", () => {
  test("inserts into a group at the index and re-indexes", async () => {
    const trip = await createTrip(prisma, sampleTrip());
    const g = await createGroup(prisma, trip.id, "G");
    const a = await addPoi(prisma, trip.id, { name: "A", lat: 1, lng: 1, groupId: g.id });
    const b = await addPoi(prisma, trip.id, { name: "B", lat: 2, lng: 2, groupId: g.id });
    const c = await addPoi(prisma, trip.id, { name: "C", lat: 3, lng: 3 }); // ungrouped

    await moveToGroup(prisma, c.id, g.id, 1);

    const inGroup = await prisma.poi.findMany({
      where: { groupId: g.id },
      orderBy: { orderInGroup: "asc" },
    });
    expect(inGroup.map((p) => p.id)).toEqual([a.id, c.id, b.id]);
    expect(inGroup.map((p) => p.orderInGroup)).toEqual([0, 1, 2]);
  });

  test("moving to ungrouped (null) re-indexes the source group", async () => {
    const trip = await createTrip(prisma, sampleTrip());
    const g = await createGroup(prisma, trip.id, "G");
    const a = await addPoi(prisma, trip.id, { name: "A", lat: 1, lng: 1, groupId: g.id });
    const b = await addPoi(prisma, trip.id, { name: "B", lat: 2, lng: 2, groupId: g.id });

    await moveToGroup(prisma, a.id, null, 0);

    expect((await prisma.poi.findUnique({ where: { id: a.id } }))?.groupId).toBeNull();
    expect((await prisma.poi.findUnique({ where: { id: b.id } }))?.orderInGroup).toBe(0);
  });

  test("rejects a group from a different trip", async () => {
    const tripA = await createTrip(prisma, sampleTrip());
    const tripB = await createTrip(prisma, sampleTrip());
    const gB = await createGroup(prisma, tripB.id, "B");
    const p = await addPoi(prisma, tripA.id, { name: "P", lat: 1, lng: 1 });
    await expect(moveToGroup(prisma, p.id, gB.id, 0)).rejects.toBeInstanceOf(ItineraryError);
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `bun run test`
Expected: move-to-group suite fails (export missing).

- [ ] **Step 3: Implement** — append to `lib/itinerary/operations.ts`:
```ts
export async function moveToGroup(
  prisma: PrismaClient,
  poiId: string,
  groupId: string | null,
  orderInGroup: number,
) {
  return prisma.$transaction(async (tx) => {
    const poi = await tx.poi.findUnique({ where: { id: poiId } });
    if (!poi) throw new ItineraryError("POI not found");
    const oldGroupId = poi.groupId;

    if (groupId) {
      const group = await tx.poiGroup.findFirst({ where: { id: groupId, tripId: poi.tripId } });
      if (!group) throw new ItineraryError("Group does not belong to this trip");
    }

    const siblings = await tx.poi.findMany({
      where: { tripId: poi.tripId, groupId, id: { not: poiId } },
      orderBy: { orderInGroup: "asc" },
      select: { id: true },
    });
    const ids = siblings.map((s) => s.id);
    const index = Math.max(0, Math.min(orderInGroup, ids.length));
    ids.splice(index, 0, poiId);
    for (let i = 0; i < ids.length; i++) {
      await tx.poi.update({ where: { id: ids[i] }, data: { groupId, orderInGroup: i } });
    }

    if (oldGroupId !== groupId) {
      const src = await tx.poi.findMany({
        where: { tripId: poi.tripId, groupId: oldGroupId },
        orderBy: { orderInGroup: "asc" },
        select: { id: true },
      });
      for (let i = 0; i < src.length; i++) {
        await tx.poi.update({ where: { id: src[i].id }, data: { orderInGroup: i } });
      }
    }

    return tx.poi.findUnique({ where: { id: poiId } });
  });
}
```

- [ ] **Step 4: Run and confirm pass**

Run: `bun run test`
Expected: all pass including the 3 move-to-group cases.

- [ ] **Step 5: Commit**

```bash
git add lib/itinerary/operations.ts tests/itinerary/move-to-group.test.ts
git commit -m "feat: add moveToGroup operation with tests"
```

---

## Task 5: Schemas + API routes (groups + PATCH group op)

**Files:** modify `lib/itinerary/schema.ts`, `tests/itinerary/schema.test.ts`, `app/api/pois/[poiId]/route.ts`; create `app/api/trips/[tripId]/groups/route.ts`, `app/api/groups/[groupId]/route.ts`.

- [ ] **Step 1: Add failing schema tests** — append to `tests/itinerary/schema.test.ts` (add `createGroupSchema` to the existing import from `@/lib/itinerary/schema`):
```ts
describe("createGroupSchema", () => {
  test("accepts a non-empty name", () => {
    expect(createGroupSchema.safeParse({ name: "Wineries" }).success).toBe(true);
  });
  test("rejects an empty name", () => {
    expect(createGroupSchema.safeParse({ name: "" }).success).toBe(false);
  });
});

describe("patchPoiSchema group op", () => {
  test("accepts a group op (group + index)", () => {
    expect(patchPoiSchema.safeParse({ op: "group", groupId: "g1", orderInGroup: 0 }).success).toBe(true);
  });
  test("accepts a group op to ungrouped (null)", () => {
    expect(patchPoiSchema.safeParse({ op: "group", groupId: null, orderInGroup: 2 }).success).toBe(true);
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `bun test tests/itinerary/schema.test.ts`
Expected: FAIL — `createGroupSchema` missing / `group` op rejected.

- [ ] **Step 3: Implement schema changes** — in `lib/itinerary/schema.ts`:

Add to the `addPoiSchema` object (alongside the existing optional fields):
```ts
  groupId: z.string().optional(),
```
Add a third member to the `patchPoiSchema` discriminated union:
```ts
  z.object({
    op: z.literal("group"),
    groupId: z.string().nullable(),
    orderInGroup: z.number().int().min(0),
  }),
```
Add a new schema + type at the end:
```ts
export const createGroupSchema = z.object({ name: z.string().min(1, "Name is required") });
export type CreateGroupBody = z.infer<typeof createGroupSchema>;
export const reorderGroupsSchema = z.object({ orderedIds: z.array(z.string()) });
export const renameGroupSchema = createGroupSchema;
```

- [ ] **Step 4: Run schema tests**

Run: `bun test tests/itinerary/schema.test.ts`
Expected: PASS (new cases).

- [ ] **Step 5: Extend `app/api/pois/[poiId]/route.ts` PATCH** — add `moveToGroup` to the operations import and a branch in the PATCH handler. Update the import line:
```ts
import { removePoi, movePoi, setOvernight, moveToGroup, ItineraryError } from "@/lib/itinerary/operations";
```
In the PATCH handler, replace the `const poi = data.op === "move" ? … : await setOvernight(…)` assignment with:
```ts
    let poi;
    if (data.op === "move") {
      poi = await movePoi(prisma, poiId, { dayId: data.dayId, orderInDay: data.orderInDay });
    } else if (data.op === "group") {
      poi = await moveToGroup(prisma, poiId, data.groupId, data.orderInGroup);
    } else {
      poi = await setOvernight(prisma, poiId, data.isOvernight);
    }
```

- [ ] **Step 6: Create `app/api/trips/[tripId]/groups/route.ts`**
```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createGroup, reorderGroups } from "@/lib/itinerary/operations";
import { createGroupSchema, reorderGroupsSchema } from "@/lib/itinerary/schema";

type Ctx = { params: Promise<{ tripId: string }> };

export async function POST(req: Request, { params }: Ctx) {
  const { tripId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = createGroupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const group = await createGroup(prisma, tripId, parsed.data.name);
  return NextResponse.json(group, { status: 201 });
}

export async function PUT(req: Request, { params }: Ctx) {
  const { tripId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = reorderGroupsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  await reorderGroups(prisma, tripId, parsed.data.orderedIds);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 7: Create `app/api/groups/[groupId]/route.ts`**
```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { renameGroup, deleteGroup } from "@/lib/itinerary/operations";
import { renameGroupSchema } from "@/lib/itinerary/schema";

type Ctx = { params: Promise<{ groupId: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const { groupId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = renameGroupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const group = await renameGroup(prisma, groupId, parsed.data.name);
  return NextResponse.json(group);
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { groupId } = await params;
  await deleteGroup(prisma, groupId);
  return new NextResponse(null, { status: 204 });
}
```

- [ ] **Step 8: Build + tests**

Run: `bun run build` (success; the new group routes + existing `ƒ /api/pois/[poiId]` listed) then `bun run test` (all pass).

- [ ] **Step 9: Commit**

```bash
git add lib/itinerary/schema.ts tests/itinerary/schema.test.ts app/api/pois/[poiId]/route.ts app/api/trips/[tripId]/groups app/api/groups
git commit -m "feat: add group schemas and API routes (+ PATCH group op)"
```

---

## Task 6: getTrip groups + client types + fetchers

**Files:** modify `lib/trips/service.ts`, `lib/api/trips.ts`.

- [ ] **Step 1: Include groups in `getTrip`** — in `lib/trips/service.ts`, add `poiGroups` to the `getTrip` `include`:
```ts
      poiGroups: { orderBy: { orderIndex: "asc" } },
```
(Place it alongside the existing `days`/`pois` includes.)

- [ ] **Step 2: Extend client types + add fetchers in `lib/api/trips.ts`**

Add to `PoiDetail`:
```ts
  groupId: string | null;
  orderInGroup: number | null;
```
Add a group type and put it on `TripDetail`:
```ts
export type TripGroup = { id: string; name: string; orderIndex: number };
```
In `TripDetail`, add:
```ts
  poiGroups: TripGroup[];
```
Append fetchers:
```ts
export async function createGroupRequest(tripId: string, name: string): Promise<TripGroup> {
  const res = await fetch(`/api/trips/${tripId}/groups`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error(`Failed to create group (${res.status})`);
  return res.json();
}

export async function renameGroupRequest(groupId: string, name: string): Promise<void> {
  const res = await fetch(`/api/groups/${groupId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error(`Failed to rename group (${res.status})`);
}

export async function deleteGroupRequest(groupId: string): Promise<void> {
  const res = await fetch(`/api/groups/${groupId}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Failed to delete group (${res.status})`);
}

export async function reorderGroupsRequest(tripId: string, orderedIds: string[]): Promise<void> {
  const res = await fetch(`/api/trips/${tripId}/groups`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ orderedIds }),
  });
  if (!res.ok) throw new Error(`Failed to reorder groups (${res.status})`);
}

export async function moveToGroupRequest(
  poiId: string,
  groupId: string | null,
  orderInGroup: number,
): Promise<void> {
  const res = await fetch(`/api/pois/${poiId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ op: "group", groupId, orderInGroup }),
  });
  if (!res.ok) throw new Error(`Failed to move to group (${res.status})`);
}
```

- [ ] **Step 3: Build**

Run: `bun run build`
Expected: success (types compile; `getTrip` now returns `poiGroups`).

- [ ] **Step 4: Commit**

```bash
git add lib/trips/service.ts lib/api/trips.ts
git commit -m "feat: expose poiGroups in trip payload + group fetchers"
```

---

## Task 7: Group + moveToGroup mutation hooks

**Files:** create `hooks/use-group-mutations.ts`.

- [ ] **Step 1: Create `hooks/use-group-mutations.ts`**
```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  createGroupRequest,
  renameGroupRequest,
  deleteGroupRequest,
  reorderGroupsRequest,
  moveToGroupRequest,
} from "@/lib/api/trips";
import { tripQueryKey } from "@/hooks/use-trip";

export function useCreateGroup(tripId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => createGroupRequest(tripId, name),
    onSuccess: () => qc.invalidateQueries({ queryKey: tripQueryKey(tripId) }),
  });
}

export function useRenameGroup(tripId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { groupId: string; name: string }) => renameGroupRequest(v.groupId, v.name),
    onSuccess: () => qc.invalidateQueries({ queryKey: tripQueryKey(tripId) }),
  });
}

export function useDeleteGroup(tripId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (groupId: string) => deleteGroupRequest(groupId),
    onSuccess: () => qc.invalidateQueries({ queryKey: tripQueryKey(tripId) }),
  });
}

export function useReorderGroups(tripId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (orderedIds: string[]) => reorderGroupsRequest(tripId, orderedIds),
    onSuccess: () => qc.invalidateQueries({ queryKey: tripQueryKey(tripId) }),
  });
}

export function useMoveToGroup(tripId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { poiId: string; groupId: string | null; orderInGroup: number }) =>
      moveToGroupRequest(v.poiId, v.groupId, v.orderInGroup),
    onSuccess: () => qc.invalidateQueries({ queryKey: tripQueryKey(tripId) }),
  });
}
```

- [ ] **Step 2: Build**

Run: `bun run build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add hooks/use-group-mutations.ts
git commit -m "feat: add group + moveToGroup mutation hooks"
```

---

## Task 8: Master-list catalog row + group section

**Files:** create `components/catalog-row.tsx`, `components/group-section.tsx`.

> A catalog row is a sortable POI row in the master list with a drag handle, a **day-badge `<select>`** (assign / change / unassign), and a **delete** ✕. A group section is a droppable container of catalog rows (one per group; `__ungrouped__` for the no-group bucket).

- [ ] **Step 1: Create `components/catalog-row.tsx`**
```tsx
"use client";

import { useSortable } from "@dnd-kit/react/sortable";
import { useRemovePoi, useMovePoi } from "@/hooks/use-poi-mutations";
import type { PoiDetail, DayDetail } from "@/lib/api/trips";

export function CatalogRow({
  poi,
  index,
  group,
  tripId,
  days,
}: {
  poi: PoiDetail;
  index: number;
  group: string;
  tripId: string;
  days: DayDetail[];
}) {
  const { ref, handleRef, isDragging } = useSortable({
    id: poi.id,
    index,
    group,
    type: "poi",
    accept: "poi",
  });
  const removePoi = useRemovePoi(tripId);
  const movePoi = useMovePoi(tripId);

  function onAssign(value: string) {
    if (value === "") {
      movePoi.mutate({ poiId: poi.id, dayId: null, orderInDay: 0 });
    } else {
      // append to the end of that day (movePoi clamps the index)
      movePoi.mutate({ poiId: poi.id, dayId: value, orderInDay: 9999 });
    }
  }

  return (
    <li
      ref={ref}
      className={`flex items-center gap-2 rounded-md border bg-background px-2 py-1.5 text-sm ${
        isDragging ? "opacity-50" : ""
      }`}
    >
      <span ref={handleRef} aria-label="Drag to a group" className="cursor-grab select-none px-1 text-muted-foreground">
        ⠿
      </span>
      <span className="flex-1 truncate">{poi.name}</span>
      <select
        aria-label={`Assign ${poi.name} to a day`}
        className="rounded border bg-background px-1 py-0.5 text-xs"
        value={poi.dayId ?? ""}
        onChange={(e) => onAssign(e.target.value)}
      >
        <option value="">—</option>
        {days.map((d) => (
          <option key={d.id} value={d.id}>
            Day {d.dayIndex + 1}
          </option>
        ))}
      </select>
      <button
        type="button"
        aria-label={`Delete ${poi.name}`}
        className="px-1 text-muted-foreground hover:text-red-600"
        onClick={() => removePoi.mutate(poi.id)}
      >
        ✕
      </button>
    </li>
  );
}
```

- [ ] **Step 2: Create `components/group-section.tsx`**
```tsx
"use client";

import { useDroppable } from "@dnd-kit/react";
import { CatalogRow } from "@/components/catalog-row";
import type { PoiDetail, DayDetail } from "@/lib/api/trips";

export function GroupSection({
  containerId,
  pois,
  tripId,
  days,
}: {
  containerId: string;
  pois: PoiDetail[];
  tripId: string;
  days: DayDetail[];
}) {
  const { ref } = useDroppable({ id: containerId, type: "poi", accept: "poi" });
  return (
    <ul ref={ref} className="min-h-8 space-y-1">
      {pois.length === 0 ? (
        <li className="px-1 py-1 text-xs text-muted-foreground">No places here.</li>
      ) : (
        pois.map((p, i) => (
          <CatalogRow key={p.id} poi={p} index={i} group={containerId} tripId={tripId} days={days} />
        ))
      )}
    </ul>
  );
}
```

- [ ] **Step 3: Build**

Run: `bun run build`
Expected: success (components compile; not yet rendered).

- [ ] **Step 4: Commit**

```bash
git add components/catalog-row.tsx components/group-section.tsx
git commit -m "feat: add catalog row and group section components"
```

---

## Task 9: Master list (grouped, own dnd) + group management

**Files:** create `components/master-list.tsx`.

> Renders the grouped master list inside its **own** `DragDropProvider` (so dragging POIs between groups never collides with the itinerary's dnd). Includes a "New group", inline rename, and delete per group, plus the always-present "Ungrouped" bucket.

- [ ] **Step 1: Create `components/master-list.tsx`**
```tsx
"use client";

import { useState } from "react";
import { DragDropProvider } from "@dnd-kit/react";
import { move } from "@dnd-kit/helpers";
import { GroupSection } from "@/components/group-section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCreateGroup, useRenameGroup, useDeleteGroup, useMoveToGroup } from "@/hooks/use-group-mutations";
import type { TripDetail, PoiDetail } from "@/lib/api/trips";

const UNGROUPED = "__ungrouped__";

export function MasterList({ trip, tripId }: { trip: TripDetail; tripId: string }) {
  const createGroup = useCreateGroup(tripId);
  const renameGroup = useRenameGroup(tripId);
  const deleteGroup = useDeleteGroup(tripId);
  const moveToGroup = useMoveToGroup(tripId);
  const [newName, setNewName] = useState("");

  const inGroup = (groupId: string | null): PoiDetail[] =>
    trip.pois
      .filter((p) => (p.groupId ?? null) === groupId)
      .sort((a, b) => (a.orderInGroup ?? 0) - (b.orderInGroup ?? 0));

  // grouped record for dnd: container id -> poi ids
  const groups: Record<string, string[]> = { [UNGROUPED]: inGroup(null).map((p) => p.id) };
  for (const g of trip.poiGroups) groups[g.id] = inGroup(g.id).map((p) => p.id);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function onDragEnd(event: any) {
    if (event.canceled) return;
    const poiId = event.operation?.source?.id;
    if (poiId == null) return;
    const next = move(groups, event) as Record<string, string[]>;
    if (next === groups) return;
    for (const [key, ids] of Object.entries(next)) {
      const i = ids.indexOf(poiId);
      if (i !== -1) {
        moveToGroup.mutate({
          poiId: String(poiId),
          groupId: key === UNGROUPED ? null : key,
          orderInGroup: i,
        });
        return;
      }
    }
  }

  return (
    <div>
      <form
        className="mb-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (newName.trim()) {
            createGroup.mutate(newName.trim());
            setNewName("");
          }
        }}
      >
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New group…"
          className="h-8 text-sm"
        />
        <Button type="submit" size="sm" variant="outline" disabled={!newName.trim()}>
          Add
        </Button>
      </form>

      <DragDropProvider onDragEnd={onDragEnd}>
        {trip.poiGroups.map((g) => (
          <div key={g.id} className="mb-3">
            <div className="mb-1 flex items-center justify-between">
              <input
                className="w-full bg-transparent text-xs font-semibold uppercase tracking-wide text-muted-foreground outline-none"
                defaultValue={g.name}
                onBlur={(e) => {
                  const name = e.target.value.trim();
                  if (name && name !== g.name) renameGroup.mutate({ groupId: g.id, name });
                }}
                aria-label={`Group name ${g.name}`}
              />
              <button
                type="button"
                aria-label={`Delete group ${g.name}`}
                className="px-1 text-xs text-muted-foreground hover:text-red-600"
                onClick={() => deleteGroup.mutate(g.id)}
              >
                ✕
              </button>
            </div>
            <GroupSection containerId={g.id} pois={inGroup(g.id)} tripId={tripId} days={trip.days} />
          </div>
        ))}

        <div className="mb-3">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Ungrouped
          </div>
          <GroupSection containerId={UNGROUPED} pois={inGroup(null)} tripId={tripId} days={trip.days} />
        </div>
      </DragDropProvider>
    </div>
  );
}
```

- [ ] **Step 2: Build**

Run: `bun run build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add components/master-list.tsx
git commit -m "feat: add grouped master list with group management + between-group drag"
```

---

## Task 10: Wire the master list into the planner

**Files:** modify `components/planner-shell.tsx` (full replacement below).

> CRITICAL structural change: the master list has its **own** `DragDropProvider`. So the itinerary's `DragDropProvider` must wrap **only the day columns** — NOT the whole sidebar — otherwise the two providers nest (unsupported, and the same POI id would live in both). The outer single provider is removed; `<MasterList>` becomes a sibling above an itinerary provider that wraps just the day blocks. The old "pool" container is gone (unscheduled POIs live only in the master list); the itinerary `groups` record now contains only day containers.

- [ ] **Step 1: Replace `components/planner-shell.tsx` entirely with:**

```tsx
"use client";

import { APIProvider } from "@vis.gl/react-google-maps";
import { DragDropProvider } from "@dnd-kit/react";
import { move } from "@dnd-kit/helpers";
import { TripMap, type MapPoint } from "@/components/trip-map";
import { PlaceSearch } from "@/components/place-search";
import { PoiContainer } from "@/components/poi-container";
import { MasterList } from "@/components/master-list";
import { Button } from "@/components/ui/button";
import { useTrip } from "@/hooks/use-trip";
import { useRoute } from "@/hooks/use-route";
import { useAddPoi, useMovePoi, useOptimizeDay, useBuildSplit, useResplit } from "@/hooks/use-poi-mutations";
import type { AddPoiInput } from "@/lib/itinerary/operations";

function formatDuration(seconds: number): string {
  if (!seconds) return "0 min";
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (h && m) return `${h} h ${m} min`;
  if (h) return `${h} h`;
  return `${m} min`;
}

export function PlannerShell({ tripId }: { tripId: string }) {
  const { data: trip, isLoading, isError } = useTrip(tripId);
  const { data: route } = useRoute(tripId);
  const addPoi = useAddPoi(tripId);
  const movePoi = useMovePoi(tripId);
  const optimizeDay = useOptimizeDay(tripId);
  const buildSplit = useBuildSplit(tripId);
  const resplit = useResplit(tripId);

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
  const poiPoints: MapPoint[] = trip.pois.map((p) => ({ lat: p.lat, lng: p.lng, name: p.name, id: p.id }));

  const byDay = (dayId: string | null) =>
    trip.pois
      .filter((p) => p.dayId === dayId)
      .sort((a, b) => (a.orderInDay ?? 0) - (b.orderInDay ?? 0));
  const unscheduledCount = byDay(null).length;
  const assignedCount = trip.pois.length - unscheduledCount;

  // itinerary dnd: day containers only (no pool)
  const dayGroups: Record<string, string[]> = {};
  for (const day of trip.days) dayGroups[day.id] = byDay(day.id).map((p) => p.id);

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
  function onItineraryDragEnd(event: any) {
    if (event.canceled) return;
    const poiId = event.operation?.source?.id;
    if (poiId == null) return;
    const next = move(dayGroups, event) as Record<string, string[]>;
    if (next === dayGroups) return;
    for (const [key, ids] of Object.entries(next)) {
      const i = ids.indexOf(poiId);
      if (i !== -1) {
        movePoi.mutate({ poiId: String(poiId), dayId: key, orderInDay: i });
        return;
      }
    }
  }

  return (
    <APIProvider apiKey={apiKey}>
      <div className="flex h-screen w-full">
        <div className="relative flex-1">
          {apiKey ? (
            <TripMap start={start} end={end} pois={poiPoints} onAddPlace={handleAddFromMap} routePolyline={route?.encodedPolyline ?? null} />
          ) : (
            <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
              Set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to enable the map and place search.
            </div>
          )}
        </div>

        <aside className="flex w-80 shrink-0 flex-col overflow-y-auto border-l p-4">
          <h2 className="mb-1 text-lg font-semibold">{trip.title}</h2>
          <p className="mb-1 text-sm text-muted-foreground">
            {trip.startName}
            {end ? ` → ${end.name}` : " (round trip)"}
          </p>
          {route && route.totalSeconds > 0 && (
            <p className="mb-4 text-xs text-muted-foreground">
              Total driving: {formatDuration(route.totalSeconds)} · {Math.round(route.totalMeters / 1000)} km
            </p>
          )}

          <div className="mb-4">
            <PlaceSearch tripId={tripId} />
          </div>

          <div className="mb-3 flex gap-2">
            <Button
              size="sm"
              className="flex-1"
              disabled={unscheduledCount === 0 || buildSplit.isPending}
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
                    "Re-split the whole trip? This rebuilds every day from scratch and clears your overnight marks.",
                  )
                ) {
                  resplit.mutate();
                }
              }}
            >
              {resplit.isPending ? "Re-splitting…" : "Re-split all"}
            </Button>
          </div>

          <div className="mb-4">
            <div className="mb-2 text-sm font-medium">Places ({trip.pois.length})</div>
            <MasterList trip={trip} tripId={tripId} />
          </div>

          <DragDropProvider onDragEnd={onItineraryDragEnd}>
            <div className="space-y-3">
              {trip.days.map((day) => (
                <div key={day.id} className="rounded-md border p-3">
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
                          disabled={optimizeDay.isPending && optimizeDay.variables === day.id}
                          onClick={() => optimizeDay.mutate(day.id)}
                          aria-label={`Optimize order of day ${day.dayIndex + 1}`}
                        >
                          {optimizeDay.isPending && optimizeDay.variables === day.id ? "Optimizing…" : "Optimize"}
                        </Button>
                      ) : null}
                    </span>
                  </div>
                  <PoiContainer id={day.id} pois={byDay(day.id)} tripId={tripId} emptyText="Assign places from the list above." />
                </div>
              ))}
            </div>
          </DragDropProvider>
        </aside>
      </div>
    </APIProvider>
  );
}
```

- [ ] **Step 2: Build + tests**

Run: `bun run build` (success) then `bun run test` (all pass).

- [ ] **Step 3: Commit**

```bash
git add components/planner-shell.tsx
git commit -m "feat: render grouped master list; itinerary dnd wraps only day columns"
```

---

## Task 11: Day card ✕ becomes "remove from day"

**Files:** modify `components/poi-card.tsx`.

> `poi-card` now renders only inside day columns (the master list uses `catalog-row`). Its ✕ must **unschedule** (`movePoi` → `dayId: null`), which keeps the POI in the master list — not delete it. The overnight 🌙 toggle stays. Delete lives only in the master list (`catalog-row`).

- [ ] **Step 1: Modify `components/poi-card.tsx`**

(a) Change the hooks import from `useRemovePoi` to `useMovePoi`:
```tsx
import { useMovePoi, useSetOvernight } from "@/hooks/use-poi-mutations";
```
(b) Replace `const removePoi = useRemovePoi(tripId);` with:
```tsx
  const movePoi = useMovePoi(tripId);
```
(c) Remove the now-pointless `const inDay = group !== "pool";` line and the `{inDay && ( … )}` wrapper around the 🌙 button — render the 🌙 button unconditionally (cards only ever appear in days now). Keep the button itself unchanged.
(d) Replace the ✕ `<Button>` with a remove-from-day action:
```tsx
      <Button
        variant="ghost"
        size="sm"
        aria-label={`Remove ${poi.name} from this day`}
        onClick={() => movePoi.mutate({ poiId: poi.id, dayId: null, orderInDay: 0 })}
      >
        ✕
      </Button>
```

- [ ] **Step 2: Build + tests**

Run: `bun run build` (success) then `bun run test` (all pass).

- [ ] **Step 3: Commit**

```bash
git add components/poi-card.tsx
git commit -m "feat: day card ✕ removes from day (keeps POI in the master list)"
```

---

## Task 12: Full verification

**Files:** none.

- [ ] **Step 1: Tests + build**

Run: `bun run test` (all pass incl. groups, move-to-group, addPoi-group suites) and `bun run build` (success; group routes present).

- [ ] **Step 2: Manual smoke test** (dev server, real key)

Run `bun run dev`, open a multi-day trip, then:
1. Add several places (search / map) → they appear under **Ungrouped** in the master list.
2. Click **New group** ("Wineries") → it appears; drag a place's ⠿ handle into it → the place moves under Wineries (and stays in the list).
3. On a place's **day `<select>`**, pick **Day 1** → it appears in Day 1's column AND remains in the master list with the select showing "Day 1".
4. In Day 1, **remove-from-day** (✕ on the day card) → it leaves Day 1 but is still in the master list (select back to "—").
5. **Build route & split into days** still distributes the unscheduled places into days; scheduled ones stay; the route + drive times update.
6. **Rename** a group (edit the header) and **delete** a group (✕) → its places fall back to Ungrouped, not deleted.
7. The master-list **✕** deletes a place entirely (gone from list and any day).

Expected: all seven. Day assignment via the select is the supported path; dragging a list row directly onto a day is intentionally not wired (badge does it).

- [ ] **Step 3: Final commit (notes, if any)**

```bash
git add -A
git commit -m "docs: poi catalog & groups verified" --allow-empty
```

---

## Done — Definition of Done

- `bun run test` passes (adds group CRUD, moveToGroup, addPoi-group suites).
- `bun run build` succeeds with the new group endpoints.
- POIs persist in a grouped master list; assigning to a day (via the badge select) keeps them in the list and shows them in the day; remove-from-day ≠ delete; groups can be created/renamed/deleted (POIs → Ungrouped) and POIs dragged between groups; the split engine still works on unscheduled POIs.

**Deferred (intentional):** the drag *gesture* from a master-list row directly onto a day (needs the same POI as two draggable items in one dnd provider). Assignment is fully covered by the day badge. Revisit if the drag gesture is wanted.
