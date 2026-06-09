# Start-Only Creation with an Editable Finish — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create trips with only a start (title + optional description), and make the start and the finish (Open / Round trip / Specific place) editable in the planner.

**Architecture:** No schema change — the three finish modes map onto the existing `isRoundTrip` + `end*` fields. The route engine learns an optional terminator (Open = none). Creation is simplified to start-only (always Open, 1 day). The planner edits start/finish through an extended `updateTrip` patch and `PATCH /api/trips/[tripId]`.

**Tech Stack:** Next.js 16 / React 19, TypeScript, Prisma 7 (libSQL), Zod 4, TanStack Query, `@vis.gl/react-google-maps`, Bun test. Reuses the existing `PlaceAutocomplete` component.

---

## File Structure

- `lib/routing/itinerary-route.ts` — optional-terminator logic in `orderedRoutePoints` + `buildRoute`.
- `lib/trips/schema.ts` — slim `createTripSchema`/`CreateTripData`; extend `updateTripSchema` with `start`/`finish`.
- `lib/trips/service.ts` — `createTrip` always Open; `updateTrip` maps `start`/`finish` to columns.
- `app/api/trips/route.ts` — POST geocodes only the start.
- `app/api/trips/[tripId]/route.ts` — PATCH passes `start`/`finish` through.
- `components/trip-form.tsx` — start-only creation form.
- `lib/api/trips.ts` — `setTripBaseRequest` fetcher.
- `hooks/use-trip-mutations.ts` (new) — `useUpdateTripBase`.
- `components/planner-shell.tsx` — editable start, segmented finish, summary line, map end gating.
- Tests: `tests/routing/itinerary-route.test.ts`, `tests/trips/service.test.ts`, `tests/trips/schema.test.ts`.

---

### Task 1: Route engine — optional terminator (Open finish)

**Files:**
- Modify: `lib/routing/itinerary-route.ts`
- Test: `tests/routing/itinerary-route.test.ts`

Today both functions compute `end = endLat != null ? end : start`, so a missing end loops back to start. New rule: a terminator exists only for a specific place (end set) or a round trip (start); otherwise it is `null` (Open — route ends at the last stop).

- [ ] **Step 1: Add failing tests**

In `tests/routing/itinerary-route.test.ts`, the existing `baseTrip(pois, end)` sets `isRoundTrip: end === null`. For Open-mode tests we need `isRoundTrip: false` with no end. Add this `describe` block at the end of the file:

```ts
describe("finish modes", () => {
  function openTrip(pois: PoiDetail[]): TripDetail {
    return { ...baseTrip(pois, null), isRoundTrip: false };
  }

  test("orderedRoutePoints: open finish ends at the last stop (no terminator)", () => {
    const trip = openTrip([poi("a", "d1", 0, 1, 1), poi("b", "d2", 0, 2, 2)]);
    const { coords, legDayId } = orderedRoutePoints(trip);
    expect(coords).toEqual([
      { lat: 0, lng: 0 },
      { lat: 1, lng: 1 },
      { lat: 2, lng: 2 },
    ]);
    expect(legDayId).toEqual(["d1", "d2"]);
  });

  test("orderedRoutePoints: open finish with no stops is just the start, no legs", () => {
    const trip = openTrip([]);
    const { coords, legDayId } = orderedRoutePoints(trip);
    expect(coords).toEqual([{ lat: 0, lng: 0 }]);
    expect(legDayId).toEqual([]);
  });

  test("orderedRoutePoints: round trip returns to start", () => {
    const trip = baseTrip([poi("a", "d1", 0, 1, 1)], null); // isRoundTrip true
    const { coords } = orderedRoutePoints(trip);
    expect(coords[coords.length - 1]).toEqual({ lat: 0, lng: 0 });
  });

  test("orderedRoutePoints: specific place ends at the end point", () => {
    const trip = baseTrip([poi("a", "d1", 0, 1, 1)], { lat: 3, lng: 3 }); // isRoundTrip false
    const { coords } = orderedRoutePoints(trip);
    expect(coords[coords.length - 1]).toEqual({ lat: 3, lng: 3 });
  });

  test("buildRoute: open finish has no terminator waypoint", () => {
    const trip = openTrip([poi("a", "d1", 0, 1, 1)]);
    const { waypoints, legDayId } = buildRoute(trip, []);
    expect(waypoints).toEqual([
      { lat: 0, lng: 0 },
      { lat: 1, lng: 1 },
    ]);
    expect(legDayId).toEqual(["d1"]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `DATABASE_URL="file:./test.db" bun test tests/routing/itinerary-route.test.ts`
Expected: FAIL — open-mode cases still append a terminator (extra coord/waypoint back at start).

- [ ] **Step 3: Implement the optional terminator in `orderedRoutePoints`**

In `lib/routing/itinerary-route.ts`, replace this block:

```ts
  const start: LatLngLiteral = { lat: trip.startLat, lng: trip.startLng };
  const end: LatLngLiteral =
    trip.endLat != null && trip.endLng != null
      ? { lat: trip.endLat, lng: trip.endLng }
      : start;

  const coords: LatLngLiteral[] = [start, ...assigned.map((p) => ({ lat: p.lat, lng: p.lng })), end];
```

with:

```ts
  const start: LatLngLiteral = { lat: trip.startLat, lng: trip.startLng };
  const terminator: LatLngLiteral | null =
    trip.endLat != null && trip.endLng != null
      ? { lat: trip.endLat, lng: trip.endLng } // specific place
      : trip.isRoundTrip
        ? start // round trip
        : null; // open — end at the last stop

  const coords: LatLngLiteral[] = [
    start,
    ...assigned.map((p) => ({ lat: p.lat, lng: p.lng })),
    ...(terminator ? [terminator] : []),
  ];
```

The existing `legDayId` loop already handles a variable number of coords: with no terminator and N stops, every leg `i` has `i < stopDayIds.length`, so each is attributed to its arrival stop's day.

- [ ] **Step 4: Implement the optional terminator in `buildRoute`**

In the same file, replace:

```ts
  const start: RouteWaypoint = { lat: trip.startLat, lng: trip.startLng };
  const end: RouteWaypoint =
    trip.endLat != null && trip.endLng != null
      ? { lat: trip.endLat, lng: trip.endLng }
      : { lat: trip.startLat, lng: trip.startLng };
```

with:

```ts
  const start: RouteWaypoint = { lat: trip.startLat, lng: trip.startLng };
  const terminator: RouteWaypoint | null =
    trip.endLat != null && trip.endLng != null
      ? { lat: trip.endLat, lng: trip.endLng } // specific place
      : trip.isRoundTrip
        ? { lat: trip.startLat, lng: trip.startLng } // round trip
        : null; // open
```

Then replace the unconditional terminator push:

```ts
  stopovers.push({ wp: end, dayId: null, poiId: null });
  waypoints.push(end);
```

with:

```ts
  if (terminator) {
    stopovers.push({ wp: terminator, dayId: null, poiId: null });
    waypoints.push(terminator);
  }
```

(The `trailingDayId` logic below is unchanged; in Open mode there is no day-less arrival leg, so it is simply unused.)

- [ ] **Step 5: Run the tests to verify they pass**

Run: `DATABASE_URL="file:./test.db" bun test tests/routing/itinerary-route.test.ts`
Expected: PASS (all prior tests plus the 5 new ones).

- [ ] **Step 6: Commit**

```bash
git add lib/routing/itinerary-route.ts tests/routing/itinerary-route.test.ts
git -c user.name="Anatolii Lapytskyi" -c user.email="anatolii.lapytskyi@gmail.com" commit -m "feat(routing): open finish (no terminator) when no end and not a round trip"
```
(Project rule: no AI co-author trailer.)

---

### Task 2: Simplify creation to start-only (always Open, 1 day)

**Files:**
- Modify: `lib/trips/schema.ts`
- Modify: `lib/trips/service.ts`
- Modify: `app/api/trips/route.ts`
- Modify: `components/trip-form.tsx`
- Test: `tests/trips/schema.test.ts`, `tests/trips/service.test.ts`

- [ ] **Step 1: Update creation tests (they encode the OLD model — make them fail toward the new one)**

In `tests/trips/schema.test.ts`, replace the whole `describe("createTripSchema", ...)` block with:

```ts
describe("createTripSchema", () => {
  const base = {
    title: "Tuscany Loop",
    startName: "Florence, Italy",
  };

  test("accepts a start-only trip (no end, no description)", () => {
    const r = createTripSchema.safeParse(base);
    expect(r.success).toBe(true);
    expect(r.success && r.data.dayCount).toBe(1);
  });

  test("accepts an optional description", () => {
    const r = createTripSchema.safeParse({ ...base, description: "A relaxed week." });
    expect(r.success).toBe(true);
  });

  test("rejects a missing title", () => {
    const r = createTripSchema.safeParse({ ...base, title: "" });
    expect(r.success).toBe(false);
  });

  test("rejects a missing start location", () => {
    const r = createTripSchema.safeParse({ title: "X" });
    expect(r.success).toBe(false);
  });
});
```

In `tests/trips/service.test.ts`, change the `sampleData` factory to the new `CreateTripData` shape (drop `isRoundTrip` and `end`):

```ts
function sampleData(overrides: Partial<CreateTripData> = {}): CreateTripData {
  return {
    title: "Tuscany Loop",
    description: "Relaxed week of food and art.",
    startDate: null,
    dayCount: 3,
    start: { name: "Florence", lat: 43.77, lng: 11.25, placeId: "p_start" },
    ...overrides,
  };
}
```

Replace the test `"createTrip stores the trip and seeds empty days"` body's end assertion and replace the `"createTrip leaves end fields null for a round trip"` test with a default-open test:

```ts
  test("createTrip stores the trip and seeds empty days", async () => {
    const trip = await createTrip(prisma, sampleData());
    expect(trip.id).toBeTruthy();
    expect(trip.startName).toBe("Florence");
    expect(trip.days).toHaveLength(3);
    expect(trip.days.map((d) => d.dayIndex)).toEqual([0, 1, 2]);
  });

  test("createTrip defaults to an open finish (no end, not a round trip)", async () => {
    const trip = await createTrip(prisma, sampleData({ dayCount: 1 }));
    expect(trip.isRoundTrip).toBe(false);
    expect(trip.endName).toBeNull();
    expect(trip.endLat).toBeNull();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `DATABASE_URL="file:./test.db" bun test tests/trips/schema.test.ts tests/trips/service.test.ts`
Expected: FAIL — `CreateTripData` still requires `isRoundTrip`/`end`; `createTripSchema` still requires `description` and rejects the start-only object via the end refine.

- [ ] **Step 3: Slim `createTripSchema` and `CreateTripData`**

In `lib/trips/schema.ts`, replace the `createTripSchema` definition and the `CreateTripData` type:

```ts
export const createTripSchema = z.object({
  title: z.string().min(1, "Title is required"),
  startName: z.string().min(1, "Start location is required"),
  description: z.string().optional(),
  startDate: isoDate.optional(),
  dayCount: z.coerce.number().int().min(1).max(60).default(1),
});
```

```ts
export type CreateTripData = {
  title: string;
  description: string;
  startDate: Date | null;
  dayCount: number;
  start: ResolvedLocation;
};
```

(Leave `ResolvedLocation`, `isoDate`, and `UpdateTripInput`/`CreateTripInput` exports in place. `updateTripSchema` is changed in Task 3.)

- [ ] **Step 4: Update `createTrip` to always create an Open, end-less trip**

In `lib/trips/service.ts`, replace the `createTrip` function body's `data` so it no longer reads `data.isRoundTrip`/`data.end`:

```ts
export async function createTrip(prisma: PrismaClient, data: CreateTripData) {
  return prisma.trip.create({
    data: {
      title: data.title,
      description: data.description,
      isRoundTrip: false,
      startDate: data.startDate,
      startName: data.start.name,
      startLat: data.start.lat,
      startLng: data.start.lng,
      startPlaceId: data.start.placeId,
      endName: null,
      endLat: null,
      endLng: null,
      endPlaceId: null,
      days: {
        create: Array.from({ length: data.dayCount }, (_, i) => ({ dayIndex: i })),
      },
    },
    include: {
      days: { orderBy: { dayIndex: "asc" } },
      pois: true,
    },
  });
}
```

- [ ] **Step 5: Update the POST route to geocode only the start**

In `app/api/trips/route.ts`, replace the body of the `try` block in `POST`:

```ts
  try {
    const start = await geocodePlace(input.startName);

    const trip = await createTrip(prisma, {
      title: input.title,
      description: input.description ?? "",
      startDate: input.startDate ? new Date(input.startDate) : null,
      dayCount: input.dayCount,
      start,
    });
    return NextResponse.json(trip, { status: 201 });
  } catch (e) {
    if (e instanceof GeocodeError) {
      return NextResponse.json({ error: e.message }, { status: 422 });
    }
    throw e;
  }
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `DATABASE_URL="file:./test.db" bun test tests/trips/schema.test.ts tests/trips/service.test.ts`
Expected: PASS.

- [ ] **Step 7: Simplify the creation form**

Replace the entire contents of `components/trip-form.tsx` with:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

export function TripForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const form = new FormData(e.currentTarget);
    const payload = {
      title: String(form.get("title") ?? ""),
      startName: String(form.get("startName") ?? ""),
      description: String(form.get("description") ?? ""),
    };

    try {
      const res = await fetch("/api/trips", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(typeof data.error === "string" ? data.error : "Could not create trip.");
        setSubmitting(false);
        return;
      }
      const trip = await res.json();
      router.push(`/trips/${trip.id}`);
    } catch {
      setError("Network error. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 max-w-xl">
      <div className="space-y-2">
        <Label htmlFor="title">Trip title</Label>
        <Input id="title" name="title" placeholder="Tuscany Loop" required />
      </div>

      <div className="space-y-2">
        <Label htmlFor="startName">Start location</Label>
        <Input id="startName" name="startName" placeholder="Florence, Italy" required />
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">What's the trip? (optional)</Label>
        <Textarea
          id="description"
          name="description"
          rows={4}
          placeholder="A relaxed week of Tuscan food, hilltop towns, and art."
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <Button type="submit" disabled={submitting}>
        {submitting ? "Creating…" : "Create trip"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 8: Build to verify types**

Run: `bun run build`
Expected: build succeeds (no references to the removed `endName`/`isRoundTrip`/`dayCount` form fields remain).

- [ ] **Step 9: Commit**

```bash
git add lib/trips/schema.ts lib/trips/service.ts app/api/trips/route.ts components/trip-form.tsx tests/trips/schema.test.ts tests/trips/service.test.ts
git -c user.name="Anatolii Lapytskyi" -c user.email="anatolii.lapytskyi@gmail.com" commit -m "feat(trips): start-only creation (open finish, 1 day); description optional"
```

---

### Task 3: `updateTrip` start/finish patch + schema + PATCH route

**Files:**
- Modify: `lib/trips/schema.ts`
- Modify: `lib/trips/service.ts`
- Modify: `app/api/trips/[tripId]/route.ts`
- Test: `tests/trips/service.test.ts`, `tests/trips/schema.test.ts`

- [ ] **Step 1: Add failing tests**

In `tests/trips/service.test.ts`, add inside `describe("trip service", ...)`:

```ts
  test("updateTrip sets the start location", async () => {
    const created = await createTrip(prisma, sampleData());
    const updated = await updateTrip(prisma, created.id, {
      start: { name: "Pisa", lat: 43.72, lng: 10.4, placeId: "p_pisa" },
    });
    expect(updated.startName).toBe("Pisa");
    expect(updated.startLat).toBeCloseTo(43.72);
    expect(updated.startPlaceId).toBe("p_pisa");
  });

  test("updateTrip finish=place sets end and clears round trip", async () => {
    const created = await createTrip(prisma, sampleData());
    const updated = await updateTrip(prisma, created.id, {
      finish: { mode: "place", place: { name: "Rome", lat: 41.9, lng: 12.5, placeId: "p_rome" } },
    });
    expect(updated.isRoundTrip).toBe(false);
    expect(updated.endName).toBe("Rome");
    expect(updated.endLat).toBeCloseTo(41.9);
  });

  test("updateTrip finish=round sets round trip and clears end", async () => {
    const created = await createTrip(prisma, sampleData());
    await updateTrip(prisma, created.id, {
      finish: { mode: "place", place: { name: "Rome", lat: 41.9, lng: 12.5, placeId: null } },
    });
    const updated = await updateTrip(prisma, created.id, { finish: { mode: "round" } });
    expect(updated.isRoundTrip).toBe(true);
    expect(updated.endName).toBeNull();
    expect(updated.endLat).toBeNull();
  });

  test("updateTrip finish=open clears both round trip and end", async () => {
    const created = await createTrip(prisma, sampleData());
    await updateTrip(prisma, created.id, { finish: { mode: "round" } });
    const updated = await updateTrip(prisma, created.id, { finish: { mode: "open" } });
    expect(updated.isRoundTrip).toBe(false);
    expect(updated.endName).toBeNull();
  });
```

In `tests/trips/schema.test.ts`, add inside `describe("updateTripSchema", ...)`:

```ts
  test("accepts a start patch", () => {
    const r = updateTripSchema.safeParse({
      start: { name: "Pisa", lat: 43.72, lng: 10.4, placeId: null },
    });
    expect(r.success).toBe(true);
  });

  test("accepts finish open/round without a place", () => {
    expect(updateTripSchema.safeParse({ finish: { mode: "open" } }).success).toBe(true);
    expect(updateTripSchema.safeParse({ finish: { mode: "round" } }).success).toBe(true);
  });

  test("accepts finish place with a place", () => {
    const r = updateTripSchema.safeParse({
      finish: { mode: "place", place: { name: "Rome", lat: 41.9, lng: 12.5, placeId: null } },
    });
    expect(r.success).toBe(true);
  });

  test("rejects finish place without a place", () => {
    expect(updateTripSchema.safeParse({ finish: { mode: "place" } }).success).toBe(false);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `DATABASE_URL="file:./test.db" bun test tests/trips/service.test.ts tests/trips/schema.test.ts`
Expected: FAIL — `updateTrip` doesn't accept `start`/`finish`; `updateTripSchema` doesn't define them.

- [ ] **Step 3: Extend `updateTripSchema`**

In `lib/trips/schema.ts`, add a place sub-schema and replace `updateTripSchema`:

```ts
const placeInput = z.object({
  name: z.string().min(1),
  lat: z.number(),
  lng: z.number(),
  placeId: z.string().nullable(),
});

export const updateTripSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  startDate: isoDate.nullable().optional(),
  start: placeInput.optional(),
  finish: z
    .object({
      mode: z.enum(["open", "round", "place"]),
      place: placeInput.optional(),
    })
    .refine((f) => f.mode !== "place" || !!f.place, {
      message: "A place is required for a specific finish",
      path: ["place"],
    })
    .optional(),
});
```

- [ ] **Step 4: Extend `updateTrip` to map start/finish to columns**

In `lib/trips/service.ts`, ensure `Prisma` is imported (add to the existing generated-client import; if the file currently imports only `PrismaClient`, change it to also import `Prisma`):

```ts
import { PrismaClient, Prisma } from "@/lib/generated/prisma/client";
```

Replace the `updateTrip` function with:

```ts
type TripPlace = { name: string; lat: number; lng: number; placeId: string | null };

export async function updateTrip(
  prisma: PrismaClient,
  id: string,
  patch: {
    title?: string;
    description?: string;
    startDate?: Date | null;
    start?: TripPlace;
    finish?: { mode: "open" | "round" | "place"; place?: TripPlace };
  },
) {
  const data: Prisma.TripUpdateInput = {};
  if (patch.title !== undefined) data.title = patch.title;
  if (patch.description !== undefined) data.description = patch.description;
  if (patch.startDate !== undefined) data.startDate = patch.startDate;
  if (patch.start) {
    data.startName = patch.start.name;
    data.startLat = patch.start.lat;
    data.startLng = patch.start.lng;
    data.startPlaceId = patch.start.placeId;
  }
  if (patch.finish) {
    if (patch.finish.mode === "place") {
      const p = patch.finish.place!;
      data.isRoundTrip = false;
      data.endName = p.name;
      data.endLat = p.lat;
      data.endLng = p.lng;
      data.endPlaceId = p.placeId;
    } else {
      data.isRoundTrip = patch.finish.mode === "round";
      data.endName = null;
      data.endLat = null;
      data.endLng = null;
      data.endPlaceId = null;
    }
  }
  return prisma.trip.update({ where: { id }, data });
}
```

- [ ] **Step 5: Pass start/finish through the PATCH route**

In `app/api/trips/[tripId]/route.ts`, the `PATCH` handler currently destructures `startDate` and spreads the rest. Since `parsed.data` now also carries `start`/`finish` (already the right shape for `updateTrip`), no structural change is needed — the existing spread already forwards them. Confirm the handler body reads exactly:

```ts
  try {
    const { startDate, ...rest } = parsed.data;
    const trip = await updateTrip(prisma, tripId, {
      ...rest,
      ...(startDate !== undefined
        ? { startDate: startDate ? new Date(startDate) : null }
        : {}),
    });
    return NextResponse.json(trip);
  } catch (e) {
    if (isNotFound(e)) return NextResponse.json({ error: "Not found" }, { status: 404 });
    throw e;
  }
```

If it does, leave it unchanged. (`rest` carries `title`, `description`, `start`, `finish`.)

- [ ] **Step 6: Run tests to verify they pass**

Run: `DATABASE_URL="file:./test.db" bun test tests/trips/service.test.ts tests/trips/schema.test.ts`
Expected: PASS.

- [ ] **Step 7: Build**

Run: `bun run build`
Expected: succeeds.

- [ ] **Step 8: Commit**

```bash
git add lib/trips/schema.ts lib/trips/service.ts "app/api/trips/[tripId]/route.ts" tests/trips/service.test.ts tests/trips/schema.test.ts
git -c user.name="Anatolii Lapytskyi" -c user.email="anatolii.lapytskyi@gmail.com" commit -m "feat(trips): editable start and finish (open/round/place) via updateTrip patch"
```

---

### Task 4: Client fetcher/hook + planner header UI

**Files:**
- Modify: `lib/api/trips.ts`
- Create: `hooks/use-trip-mutations.ts`
- Modify: `components/planner-shell.tsx`

No unit test (UI + browser SDK); covered by the build here and the live smoke test in Task 5.

- [ ] **Step 1: Add the `setTripBaseRequest` fetcher**

In `lib/api/trips.ts`, add near the other PATCH fetchers (e.g. after `setStartDateRequest`):

```ts
export type TripPlaceInput = { name: string; lat: number; lng: number; placeId: string | null };
export type TripBasePatch = {
  start?: TripPlaceInput;
  finish?: { mode: "open" | "round" | "place"; place?: TripPlaceInput };
};

export async function setTripBaseRequest(tripId: string, patch: TripBasePatch): Promise<void> {
  const res = await fetch(`/api/trips/${tripId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`Failed to update trip (${res.status})`);
}
```

- [ ] **Step 2: Create the hook**

Create `hooks/use-trip-mutations.ts`:

```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { setTripBaseRequest, type TripBasePatch } from "@/lib/api/trips";
import { tripQueryKey } from "@/hooks/use-trip";
import { routeQueryKey } from "@/hooks/use-route";

export function useUpdateTripBase(tripId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: TripBasePatch) => setTripBaseRequest(tripId, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: tripQueryKey(tripId) });
      qc.invalidateQueries({ queryKey: routeQueryKey(tripId) });
    },
  });
}
```

- [ ] **Step 3: Wire the planner header (editable start, segmented finish, summary)**

In `components/planner-shell.tsx`:

(a) Add imports — add `useState` to the React import (the file does not currently import it) and add the two new imports:

```tsx
import { useState } from "react";
import { PlaceAutocomplete } from "@/components/place-autocomplete";
import { useUpdateTripBase } from "@/hooks/use-trip-mutations";
```

(b) Inside `PlannerShell`, after `const setStartDate = useSetStartDate(tripId);`, add:

```tsx
  const updateBase = useUpdateTripBase(tripId);
  const [pickingPlace, setPickingPlace] = useState(false);
```

(c) The existing `const end: MapPoint | null = trip.endLat != null && trip.endLng != null ? {...} : null;` already yields a marker only when a specific place is set — leave it as the map's `end` prop (Open and Round trip both pass `null`). No change needed there.

(d) Replace the summary paragraph:

```tsx
          <p className="mb-1 text-sm text-muted-foreground">
            {trip.startName}
            {end ? ` → ${end.name}` : " (round trip)"}
          </p>
```

with a summary that reflects all three modes plus the start/finish controls. Compute the current mode and render:

```tsx
          {(() => {
            const finishMode: "open" | "round" | "place" =
              trip.endLat != null ? "place" : trip.isRoundTrip ? "round" : "open";
            const activeFinish = pickingPlace ? "place" : finishMode;
            return (
              <>
                <p className="mb-2 text-sm text-muted-foreground">
                  {trip.startName}
                  {finishMode === "place"
                    ? ` → ${trip.endName}`
                    : finishMode === "round"
                      ? " ↺ round trip"
                      : " → (open)"}
                </p>

                <div className="mb-3 space-y-2">
                  <div>
                    <div className="mb-1 text-xs text-muted-foreground">
                      Start: <span className="text-foreground">{trip.startName}</span>
                    </div>
                    <PlaceAutocomplete
                      placeholder="Change start…"
                      onPick={(p) =>
                        updateBase.mutate({
                          start: { name: p.name, lat: p.lat, lng: p.lng, placeId: p.placeId },
                        })
                      }
                    />
                  </div>

                  <div>
                    <div className="mb-1 text-xs text-muted-foreground">Finish</div>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant={activeFinish === "open" ? "default" : "outline"}
                        className="h-7 px-2 text-xs"
                        onClick={() => {
                          setPickingPlace(false);
                          updateBase.mutate({ finish: { mode: "open" } });
                        }}
                      >
                        Open
                      </Button>
                      <Button
                        size="sm"
                        variant={activeFinish === "round" ? "default" : "outline"}
                        className="h-7 px-2 text-xs"
                        onClick={() => {
                          setPickingPlace(false);
                          updateBase.mutate({ finish: { mode: "round" } });
                        }}
                      >
                        Round trip
                      </Button>
                      <Button
                        size="sm"
                        variant={activeFinish === "place" ? "default" : "outline"}
                        className="h-7 px-2 text-xs"
                        onClick={() => setPickingPlace(true)}
                      >
                        Place
                      </Button>
                    </div>
                    {activeFinish === "place" && (
                      <div className="mt-1">
                        {trip.endName ? (
                          <div className="mb-1 text-xs text-muted-foreground">
                            Ends at: <span className="text-foreground">{trip.endName}</span>
                          </div>
                        ) : null}
                        <PlaceAutocomplete
                          placeholder="Search destination…"
                          onPick={(p) => {
                            updateBase.mutate({
                              finish: {
                                mode: "place",
                                place: { name: p.name, lat: p.lat, lng: p.lng, placeId: p.placeId },
                              },
                            });
                            setPickingPlace(false);
                          }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </>
            );
          })()}
```

Leave the existing "Total driving" paragraph and the Start-date `<label>` that follow unchanged.

- [ ] **Step 4: Build to verify types**

Run: `bun run build`
Expected: succeeds. (`Button` is already imported in `planner-shell.tsx`.)

- [ ] **Step 5: Commit**

```bash
git add lib/api/trips.ts hooks/use-trip-mutations.ts components/planner-shell.tsx
git -c user.name="Anatolii Lapytskyi" -c user.email="anatolii.lapytskyi@gmail.com" commit -m "feat(planner): editable start + segmented finish (open/round/place) in the header"
```

---

### Task 5: Verification

**Files:** none (validation only)

- [ ] **Step 1: Full test suite**

Run: `bun run test`
Expected: all tests pass (route-engine finish-mode tests, schema tests, service tests, plus everything prior).

- [ ] **Step 2: Production build**

Run: `bun run build`
Expected: succeeds, no type errors.

- [ ] **Step 3: Live smoke test**

Start `bun run dev`. Go to `/trips/new`:
1. The form shows only Title, Start, and optional Description (no end, no round-trip checkbox, no day count). Create with Title + Start only.
2. Lands in the planner; summary reads `‹start› → (open)`; one day; the map shows a start marker and no end marker.
3. Add a couple of POIs and assign them to the day, Build route — the route ends at the last stop (no leg back to start).
4. Finish → **Round trip**: summary shows `↺ round trip`; the route now returns to the start (a closing leg appears); still no red end marker.
5. Finish → **Place**, search a destination: summary shows `→ ‹dest›`; a red end marker appears; the route ends there.
6. **Change start** via the start search: the green marker and the route update.
7. Reload — the chosen start/finish persist. No console errors.

- [ ] **Step 4: Final review + merge**

Dispatch a final code review over the branch diff, fix anything above threshold, then merge to `main` per superpowers:finishing-a-development-branch.

---

## Notes for the implementer

- **No schema/migration.** All three finish modes live in existing columns; `createTrip` always writes Open.
- **The Open-mode route change is the crux:** previously a missing end looped to start; now Open has no terminator and the route ends at the last stop. Round trip and Specific place are unchanged in behavior.
- **The "Place" button doesn't PATCH on click** — it only reveals the destination search (`pickingPlace` local state), because `finish.mode === "place"` requires a `place` (the PATCH happens when a destination is picked). Open/Round trip PATCH immediately.
- Old trips in the DB are throwaway; no back-fill needed (the model is backward-compatible regardless).
</content>
