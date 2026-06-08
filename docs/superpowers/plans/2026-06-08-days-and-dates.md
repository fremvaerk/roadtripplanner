# Add/Remove Days & Trip Dates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user add a day (at the end) or remove any day after trip creation, and show real calendar dates on day headers derived from an editable trip start date.

**Architecture:** Reuse the existing `Trip.startDate`; day dates are derived (`start + dayIndex`), not stored. New `addDay`/`removeDay` operations (removeDay sends the day's POIs back to the pool, cascades its night, and renumbers). A pure `dayDate` helper computes UTC dates. The trip header gets a start-date picker; day headers show the date + a remove ✕; a "＋ Add day" button appends.

**Tech Stack:** Next.js 16 + React 19, Prisma 7 (libSQL), TanStack Query v5, Zod 4, Bun test runner.

---

## Context (current state)

- `Day` model: `id, tripId, dayIndex, date?, notes?`, relations `pois Poi[]`, `night NightStop?`, `@@unique([tripId, dayIndex])`. `Poi.day` relation is `onDelete: SetNull`; `NightStop.day` is `onDelete: Cascade`.
- `Trip.startDate DateTime?` exists (set at intake, currently not editable/shown).
- `lib/itinerary/operations.ts` exports `ItineraryError` + many ops. `lib/trips/service.ts` exports `createTrip`, `getTrip`, `listTrips`, `updateTrip(prisma, id, patch)`, `deleteTrip`. `lib/trips/schema.ts` exports `updateTripSchema` (`{ title?, description? }`).
- `app/api/trips/[tripId]/route.ts` has `GET`/`PATCH`(updateTrip via updateTripSchema)/`DELETE`. `app/api/days/[dayId]/` has `night/` and `optimize/` subroutes (no day-resource route yet).
- `lib/api/trips.ts` exports `TripDetail` (no `startDate` field yet), `DayDetail`, fetchers. `getTrip` returns the Prisma trip (so `startDate` is present in the JSON as an ISO string). `hooks/use-trip.ts` → `tripQueryKey`; `hooks/use-route.ts` → `routeQueryKey`.
- `components/planner-shell.tsx` renders the trip header (title, start→end, total driving), then per-day blocks (header `Day {day.dayIndex + 1}` + drive time + Optimize, a `PoiContainer`, and `DayNight`), inside the itinerary `DragDropProvider`.
- Prisma generated client `@/lib/generated/prisma/client`; DB tests via `bun run test`. Git identity configured; NO AI co-author trailer.

---

## File Structure

```
lib/itinerary/operations.ts        (MODIFY) add addDay, removeDay
lib/dates.ts                       (CREATE) pure dayDate(startDateISO, dayIndex)
lib/trips/schema.ts                (MODIFY) updateTripSchema gains startDate
lib/trips/service.ts               (MODIFY) updateTrip patch type accepts startDate: Date|null
app/api/trips/[tripId]/route.ts    (MODIFY) PATCH converts startDate ISO → Date
app/api/trips/[tripId]/days/route.ts (CREATE) POST addDay
app/api/days/[dayId]/route.ts      (CREATE) DELETE removeDay
lib/api/trips.ts                   (MODIFY) TripDetail.startDate + addDay/removeDay/setStartDate fetchers
hooks/use-day-mutations.ts         (CREATE) useAddDay / useRemoveDay / useSetStartDate
components/planner-shell.tsx       (MODIFY) start-date picker, day-header dates + remove ✕, "＋ Add day"
tests/itinerary/days.test.ts       (CREATE)
tests/dates.test.ts                (CREATE)
tests/trips/service.test.ts        (MODIFY) updateTrip startDate case
```

---

## Task 1: addDay / removeDay operations — TDD

**Files:** modify `lib/itinerary/operations.ts`; test `tests/itinerary/days.test.ts`.

- [ ] **Step 1: Write the failing test** `tests/itinerary/days.test.ts`:
```ts
import { test, expect, describe, beforeEach, afterAll } from "bun:test";
import { PrismaClient } from "@/lib/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { addDay, removeDay, addPoi, setNight, ItineraryError } from "@/lib/itinerary/operations";
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

function sampleTrip(dayCount = 2): CreateTripData {
  return {
    title: "T", description: "d", isRoundTrip: false, startDate: null, dayCount,
    start: { name: "S", lat: 0, lng: 0, placeId: null },
    end: { name: "E", lat: 1, lng: 1, placeId: null },
  };
}

describe("addDay", () => {
  test("appends a day at the next index", async () => {
    const trip = await createTrip(prisma, sampleTrip(2));
    const d = await addDay(prisma, trip.id);
    expect(d.dayIndex).toBe(2);
    expect(await prisma.day.count({ where: { tripId: trip.id } })).toBe(3);
  });
});

describe("removeDay", () => {
  test("sends the day's POIs back to the pool, deletes its night, and renumbers", async () => {
    const trip = await createTrip(prisma, sampleTrip(3)); // days index 0,1,2
    const day0 = trip.days[0].id;
    const day1 = trip.days[1].id;
    const p = await addPoi(prisma, trip.id, { name: "P", lat: 1, lng: 1, dayId: day0 });
    await setNight(prisma, day0, { lat: 0.5, lng: 0.5 });

    await removeDay(prisma, day0);

    // poi back in pool
    const fresh = await prisma.poi.findUnique({ where: { id: p.id } });
    expect(fresh?.dayId).toBeNull();
    expect(fresh?.orderInDay).toBeNull();
    // night gone (cascade)
    expect(await prisma.nightStop.count()).toBe(0);
    // 2 days left, renumbered 0,1
    const days = await prisma.day.findMany({ where: { tripId: trip.id }, orderBy: { dayIndex: "asc" } });
    expect(days.map((d) => d.dayIndex)).toEqual([0, 1]);
    // the day that was index 1 is now index 0
    expect(days[0].id).toBe(day1);
  });

  test("throws for a non-existent day", async () => {
    const trip = await createTrip(prisma, sampleTrip(1));
    await expect(removeDay(prisma, "nope")).rejects.toBeInstanceOf(ItineraryError);
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `bun run test`
Expected: days suite fails (`addDay`/`removeDay` not exported).

- [ ] **Step 3: Implement** — append to `lib/itinerary/operations.ts`:
```ts
export async function addDay(prisma: PrismaClient, tripId: string) {
  const dayIndex = await prisma.day.count({ where: { tripId } });
  return prisma.day.create({ data: { tripId, dayIndex } });
}

export async function removeDay(prisma: PrismaClient, dayId: string) {
  return prisma.$transaction(async (tx) => {
    const day = await tx.day.findUnique({ where: { id: dayId } });
    if (!day) throw new ItineraryError("Day not found");
    // detach this day's POIs back to the pool (they stay in the master list)
    await tx.poi.updateMany({ where: { dayId }, data: { dayId: null, orderInDay: null } });
    // delete the day (its NightStop cascades away)
    await tx.day.delete({ where: { id: dayId } });
    // renumber remaining days 0..n-1 ascending (each target slot is already free)
    const remaining = await tx.day.findMany({
      where: { tripId: day.tripId },
      orderBy: { dayIndex: "asc" },
    });
    for (let i = 0; i < remaining.length; i++) {
      if (remaining[i].dayIndex !== i) {
        await tx.day.update({ where: { id: remaining[i].id }, data: { dayIndex: i } });
      }
    }
  });
}
```

- [ ] **Step 4: Run and confirm pass**

Run: `bun run test`
Expected: all pass including the 3 day cases.

- [ ] **Step 5: Commit**

```bash
git add lib/itinerary/operations.ts tests/itinerary/days.test.ts
git commit -m "feat: add addDay/removeDay operations with tests"
```

---

## Task 2: Pure `dayDate` helper — TDD

**Files:** create `lib/dates.ts`; test `tests/dates.test.ts`.

- [ ] **Step 1: Write the failing test** `tests/dates.test.ts`:
```ts
import { test, expect, describe } from "bun:test";
import { dayDate } from "@/lib/dates";

describe("dayDate", () => {
  test("Day 0 is the start date (UTC)", () => {
    expect(dayDate("2026-06-09", 0)?.toISOString().slice(0, 10)).toBe("2026-06-09");
  });
  test("adds dayIndex days", () => {
    expect(dayDate("2026-06-09", 2)?.toISOString().slice(0, 10)).toBe("2026-06-11");
  });
  test("crosses month boundaries", () => {
    expect(dayDate("2026-06-30", 2)?.toISOString().slice(0, 10)).toBe("2026-07-02");
  });
  test("accepts a full ISO datetime", () => {
    expect(dayDate("2026-06-09T00:00:00.000Z", 1)?.toISOString().slice(0, 10)).toBe("2026-06-10");
  });
  test("returns null for null or invalid input", () => {
    expect(dayDate(null, 0)).toBeNull();
    expect(dayDate("not-a-date", 0)).toBeNull();
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `bun test tests/dates.test.ts`
Expected: FAIL — cannot resolve `@/lib/dates`.

- [ ] **Step 3: Implement `lib/dates.ts`**
```ts
/** start date + dayIndex days, as a UTC date (so "Day 0" == the picked date in any timezone). */
export function dayDate(startDateISO: string | null, dayIndex: number): Date | null {
  if (!startDateISO) return null;
  const base = new Date(startDateISO);
  if (Number.isNaN(base.getTime())) return null;
  return new Date(
    Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + dayIndex),
  );
}
```

- [ ] **Step 4: Run and confirm pass**

Run: `bun test tests/dates.test.ts`
Expected: PASS (5 cases).

- [ ] **Step 5: Commit**

```bash
git add lib/dates.ts tests/dates.test.ts
git commit -m "feat: add pure dayDate helper with tests"
```

---

## Task 3: updateTrip startDate (schema + op) — TDD

**Files:** modify `lib/trips/schema.ts`, `lib/trips/service.ts`, `tests/trips/service.test.ts`.

- [ ] **Step 1: Add a failing test** — append inside the `describe("trip service", …)` block in `tests/trips/service.test.ts`:
```ts
  test("updateTrip sets and clears startDate", async () => {
    const created = await createTrip(prisma, sampleData());
    const set = await updateTrip(prisma, created.id, { startDate: new Date("2026-06-09T00:00:00.000Z") });
    expect(set.startDate?.toISOString().slice(0, 10)).toBe("2026-06-09");
    const cleared = await updateTrip(prisma, created.id, { startDate: null });
    expect(cleared.startDate).toBeNull();
  });
```

- [ ] **Step 2: Run and confirm failure**

Run: `bun run test`
Expected: FAIL — `updateTrip`'s patch type doesn't accept `startDate` (TypeScript error) or the field isn't persisted.

- [ ] **Step 3: Implement**

In `lib/trips/schema.ts`, update `updateTripSchema`:
```ts
export const updateTripSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  startDate: z.string().nullable().optional(),
});
```
In `lib/trips/service.ts`, change `updateTrip`'s patch parameter type to include `startDate`:
```ts
export async function updateTrip(
  prisma: PrismaClient,
  id: string,
  patch: { title?: string; description?: string; startDate?: Date | null },
) {
  return prisma.trip.update({ where: { id }, data: patch });
}
```
(Prisma ignores `undefined` fields, so partial patches still work; the existing title/description test is unaffected.)

- [ ] **Step 4: Run and confirm pass**

Run: `bun run test`
Expected: all pass including the new updateTrip case.

- [ ] **Step 5: Commit**

```bash
git add lib/trips/schema.ts lib/trips/service.ts tests/trips/service.test.ts
git commit -m "feat: updateTrip supports startDate"
```

---

## Task 4: API routes (add/remove day, startDate PATCH)

**Files:** create `app/api/trips/[tripId]/days/route.ts`, `app/api/days/[dayId]/route.ts`; modify `app/api/trips/[tripId]/route.ts`.

- [ ] **Step 1: Create `app/api/trips/[tripId]/days/route.ts`**
```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { addDay } from "@/lib/itinerary/operations";

type Ctx = { params: Promise<{ tripId: string }> };

export async function POST(_req: Request, { params }: Ctx) {
  const { tripId } = await params;
  const day = await addDay(prisma, tripId);
  return NextResponse.json(day, { status: 201 });
}
```

- [ ] **Step 2: Create `app/api/days/[dayId]/route.ts`**
```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { removeDay, ItineraryError } from "@/lib/itinerary/operations";

type Ctx = { params: Promise<{ dayId: string }> };

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

- [ ] **Step 3: Extend `PATCH` in `app/api/trips/[tripId]/route.ts`** — the handler currently validates with `updateTripSchema` and calls `updateTrip(prisma, tripId, parsed.data)`. Replace the `updateTrip` call with one that converts `startDate` (ISO string|null) to a `Date|null`:
```ts
  const { startDate, ...rest } = parsed.data;
  const trip = await updateTrip(prisma, tripId, {
    ...rest,
    ...(startDate !== undefined ? { startDate: startDate ? new Date(startDate) : null } : {}),
  });
  return NextResponse.json(trip);
```
(Keep the existing `safeParse` 400 handling above it.)

- [ ] **Step 4: Build**

Run: `bun run build`
Expected: success; `ƒ /api/trips/[tripId]/days` and `ƒ /api/days/[dayId]` listed.

- [ ] **Step 5: Commit**

```bash
git add "app/api/trips/[tripId]/days" "app/api/days/[dayId]/route.ts" "app/api/trips/[tripId]/route.ts"
git commit -m "feat: add day add/remove API routes + startDate PATCH"
```

---

## Task 5: Client types, fetchers, hooks

**Files:** modify `lib/api/trips.ts`; create `hooks/use-day-mutations.ts`.

- [ ] **Step 1: Add `startDate` to `TripDetail` + fetchers in `lib/api/trips.ts`**

Add to the `TripDetail` type:
```ts
  startDate: string | null;
```
Append fetchers:
```ts
export async function addDayRequest(tripId: string): Promise<void> {
  const res = await fetch(`/api/trips/${tripId}/days`, { method: "POST" });
  if (!res.ok) throw new Error(`Failed to add day (${res.status})`);
}

export async function removeDayRequest(dayId: string): Promise<void> {
  const res = await fetch(`/api/days/${dayId}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Failed to remove day (${res.status})`);
}

export async function setStartDateRequest(tripId: string, startDate: string | null): Promise<void> {
  const res = await fetch(`/api/trips/${tripId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ startDate }),
  });
  if (!res.ok) throw new Error(`Failed to set start date (${res.status})`);
}
```

- [ ] **Step 2: Create `hooks/use-day-mutations.ts`**
```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { addDayRequest, removeDayRequest, setStartDateRequest } from "@/lib/api/trips";
import { tripQueryKey } from "@/hooks/use-trip";
import { routeQueryKey } from "@/hooks/use-route";

function invalidate(qc: ReturnType<typeof useQueryClient>, tripId: string) {
  qc.invalidateQueries({ queryKey: tripQueryKey(tripId) });
  qc.invalidateQueries({ queryKey: routeQueryKey(tripId) });
}

export function useAddDay(tripId: string) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: () => addDayRequest(tripId), onSuccess: () => invalidate(qc, tripId) });
}

export function useRemoveDay(tripId: string) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (dayId: string) => removeDayRequest(dayId), onSuccess: () => invalidate(qc, tripId) });
}

export function useSetStartDate(tripId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (startDate: string | null) => setStartDateRequest(tripId, startDate),
    onSuccess: () => invalidate(qc, tripId),
  });
}
```

- [ ] **Step 3: Build**

Run: `bun run build`
Expected: success.

- [ ] **Step 4: Commit**

```bash
git add lib/api/trips.ts hooks/use-day-mutations.ts
git commit -m "feat: add day/startDate client fetchers + hooks"
```

---

## Task 6: Planner UI — start date, day dates, add/remove

**Files:** modify `components/planner-shell.tsx`.

- [ ] **Step 1: Imports + hooks + date formatter**

(a) Add imports:
```tsx
import { dayDate } from "@/lib/dates";
import { useAddDay, useRemoveDay, useSetStartDate } from "@/hooks/use-day-mutations";
```
(b) Add a module-level formatter (next to `formatDuration`):
```tsx
const DATE_FMT = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
function formatDayDate(startDate: string | null, dayIndex: number): string | null {
  const d = dayDate(startDate, dayIndex);
  return d ? DATE_FMT.format(d) : null;
}
```
(c) Inside `PlannerShell`, after the existing hook calls (e.g. after `const updateNight = useUpdateNight(tripId);`), add:
```tsx
  const addDay = useAddDay(tripId);
  const removeDay = useRemoveDay(tripId);
  const setStartDate = useSetStartDate(tripId);
```

- [ ] **Step 2: Start-date picker in the trip header** — directly after the total-driving `<p>` block (the `{route && route.totalSeconds > 0 && (…)}` block), add:
```tsx
            <label className="mb-4 flex items-center gap-2 text-xs text-muted-foreground">
              <span>Start date</span>
              <input
                type="date"
                value={trip.startDate ? trip.startDate.slice(0, 10) : ""}
                onChange={(e) => setStartDate.mutate(e.target.value || null)}
                className="rounded border bg-background px-1 py-0.5 text-xs"
              />
            </label>
```

- [ ] **Step 3: Day-header date + remove ✕** — the day header currently is:
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
                        <Button … Optimize … />
                      ) : null}
                    </span>
                  </div>
```
Change the left `<span>Day {day.dayIndex + 1}</span>` to include the date, and add a remove ✕ at the end of the right `<span>`. Replace the left span with:
```tsx
                    <span>
                      Day {day.dayIndex + 1}
                      {formatDayDate(trip.startDate, day.dayIndex) ? (
                        <span className="ml-1 font-normal text-muted-foreground">
                          · {formatDayDate(trip.startDate, day.dayIndex)}
                        </span>
                      ) : null}
                    </span>
```
and add, as the LAST child inside the right-hand `<span className="flex items-center gap-2">` (after the Optimize block):
```tsx
                      <button
                        type="button"
                        aria-label={`Remove day ${day.dayIndex + 1}`}
                        className="px-1 text-xs text-muted-foreground hover:text-red-600"
                        onClick={() => {
                          if (window.confirm("Remove this day? Its places go back to the list and its night is discarded.")) {
                            removeDay.mutate(day.id);
                          }
                        }}
                      >
                        ✕
                      </button>
```

- [ ] **Step 4: "＋ Add day" button** — immediately after the `{trip.days.map(...)}` block (still inside the itinerary container, after the mapped days), add:
```tsx
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                disabled={addDay.isPending}
                onClick={() => addDay.mutate()}
              >
                ＋ Add day
              </Button>
```

- [ ] **Step 5: Build + tests**

Run: `bun run build` (success) then `bun run test` (all pass).

- [ ] **Step 6: Commit**

```bash
git add components/planner-shell.tsx
git commit -m "feat: start-date picker, day-header dates, add/remove day controls"
```

---

## Task 7: Full verification

**Files:** none.

- [ ] **Step 1: Tests + build**

Run: `bun run test` (all pass incl. days + dates + updateTrip-startDate suites) and `bun run build` (success; `ƒ /api/trips/[tripId]/days` and `ƒ /api/days/[dayId]` present).

- [ ] **Step 2: Manual smoke test** (dev server)

Run `bun run dev`, open a multi-day trip with some scheduled stops, then:
1. Set the **Start date** in the header → each day header shows its date (e.g. "Day 1 · Mon 9 Jun"); Day 2 is +1 day, etc.
2. Click **＋ Add day** → a new empty day appears at the end with the next date.
3. Put a stop (and a night) on a middle day, then click that day's **✕** and confirm → the day is removed, its stop returns to the master list (pool, unscheduled), its night is gone, and the remaining days renumber and their dates shift up.
4. Clear the start date (empty the picker) → headers revert to plain "Day N".
5. Reload → start date + day count persist.

Expected: all five. Dates match the picked start date regardless of your timezone.

- [ ] **Step 3: Final commit (notes, if any)**

```bash
git add -A
git commit -m "docs: days & dates verified" --allow-empty
```

---

## Done — Definition of Done

- `bun run test` passes (adds addDay/removeDay, dayDate, updateTrip-startDate suites).
- `bun run build` succeeds with the new day routes.
- The user can add a day (appended) and remove any day (its stops → pool, night discarded, days renumber), set/clear an editable trip start date, and see derived consecutive dates on day headers.
