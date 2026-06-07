# Phase 1a — Add Places (client data layer + itinerary operations) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user add real, mappable places to a trip — via a Places-Autocomplete search box and by clicking POIs on the map — with all additions flowing through one shared `addPoi` itinerary operation and rendering live as pins + an "unassigned pool" list.

**Architecture:** Introduce the client data layer (TanStack Query) so the planner fetches and mutates trip data interactively. Add a dependency-injected itinerary-operations module (`addPoi`/`removePoi`) that both the UI and (later) the AI call. Two API routes expose those operations. The planner becomes client-driven: it reads the trip via a `useTrip` query and mutates it via `useAddPoi`/`useRemovePoi`. Place discovery uses the **new** Google Places API (`AutocompleteSuggestion` + `Place.fetchFields`).

**Tech Stack:** Next.js 16 (App Router) + React 19, Prisma 7 (libSQL adapter), TanStack Query v5, `@vis.gl/react-google-maps`, the new Google Places API, Zod 4, Bun test runner.

---

## Context for the implementer (current state after Phase 0)

- Prisma 7: the generated client is imported from `@/lib/generated/prisma/client` (NOT `@prisma/client`). It exports `PrismaClient` and `Prisma`.
- The SQLite driver adapter is `PrismaLibSql` from `@prisma/adapter-libsql`. Tests instantiate their own client:
  ```ts
  import { PrismaClient } from "@/lib/generated/prisma/client";
  import { PrismaLibSql } from "@prisma/adapter-libsql";
  const prisma = new PrismaClient({ adapter: new PrismaLibSql({ url: process.env.DATABASE_URL ?? "file:./test.db" }) });
  ```
- `lib/db.ts` exports the singleton `prisma`. `lib/trips/service.ts` has `getTrip(prisma, id)` returning the trip with `days` (each with ordered `pois`) and a top-level `pois` array. `lib/trips/schema.ts` exports `CreateTripData`.
- DB-backed tests run with `bun run test` (which pushes the schema to `test.db` then runs `bun test`).
- `Poi` model fields (Prisma): `id, tripId, dayId?, orderInDay?, isOvernight, name, lat, lng, placeId?, category?, source ("user"), rating?, photoRef?, address?, openingHours?, aiReason?, userNote?, status ("accepted"), createdAt`. `dayId = null` means the unassigned pool.
- The map component `components/trip-map.tsx` (client) already renders start/end/poi pins via `@vis.gl/react-google-maps` and accepts `pois: MapPoint[]`.
- The planner page `app/trips/[tripId]/page.tsx` (server) calls `getTrip` and passes a `TripView` to the client `components/planner-shell.tsx`.
- Env: `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` (browser, Maps JS + Places JS) and `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID` are set in `.env`. The browser key must have the **Places API (New)** enabled in Google Cloud for search/clickable-add to work at runtime (verified in the final task).
- Git identity is configured locally; do NOT add an AI co-author trailer to commits.

---

## File Structure

```
lib/places/category.ts             map Google place types → our category string (pure)
lib/itinerary/operations.ts        addPoi / removePoi (dependency-injected, takes PrismaClient)
lib/itinerary/schema.ts            Zod schema + types for the add-poi API body
app/api/trips/[tripId]/pois/route.ts   POST: add a POI to a trip
app/api/pois/[poiId]/route.ts          DELETE: remove a POI
app/providers.tsx                  TanStack Query provider (client)
lib/api/trips.ts                   client fetchers + shared view types (TripDetail/PoiDetail)
hooks/use-trip.ts                  useTrip(tripId) query
hooks/use-poi-mutations.ts         useAddPoi / useRemovePoi
components/place-search.tsx        autocomplete search box (new Places API) → addPoi(pool)
components/planner-shell.tsx       (MODIFIED) client-fetch via useTrip; pool list; search; remove
components/trip-map.tsx            (MODIFIED) clickable map POIs → onAddPlace callback
app/trips/[tripId]/page.tsx        (MODIFIED) 404 guard, then render <PlannerShell tripId=…/>
app/layout.tsx                     (MODIFIED) wrap children in <Providers>
tests/places/category.test.ts
tests/itinerary/operations.test.ts
tests/itinerary/schema.test.ts
```

Responsibility boundaries:
- `lib/places/category.ts` — pure mapping, no I/O.
- `lib/itinerary/operations.ts` — only DB writes for POIs; takes a `PrismaClient`. This is the shared operation the UI (now) and AI (Phase 4) both call.
- API routes — validate (Zod) → call the operation. No logic.
- `lib/api/trips.ts` + hooks — the browser↔server data contract; the only place `fetch` to our API lives.
- Components — presentation + user intent; they call hooks, never `fetch` directly.

---

## Task 1: Place-category helper — TDD

**Files:** create `lib/places/category.ts`; test `tests/places/category.test.ts`.

- [ ] **Step 1: Write the failing test** `tests/places/category.test.ts`:

```ts
import { test, expect, describe } from "bun:test";
import { categoryFromTypes } from "@/lib/places/category";

describe("categoryFromTypes", () => {
  test("maps food-related types to 'food'", () => {
    expect(categoryFromTypes(["restaurant", "point_of_interest"])).toBe("food");
    expect(categoryFromTypes(["cafe"])).toBe("food");
  });

  test("maps sights to 'sight'", () => {
    expect(categoryFromTypes(["tourist_attraction"])).toBe("sight");
    expect(categoryFromTypes(["museum"])).toBe("sight");
  });

  test("maps nature to 'nature'", () => {
    expect(categoryFromTypes(["park"])).toBe("nature");
    expect(categoryFromTypes(["natural_feature"])).toBe("nature");
  });

  test("maps lodging to 'lodging'", () => {
    expect(categoryFromTypes(["lodging"])).toBe("lodging");
  });

  test("falls back to 'other' for unknown or empty", () => {
    expect(categoryFromTypes(["locality"])).toBe("other");
    expect(categoryFromTypes([])).toBe("other");
  });

  test("prefers the first matching known type in priority order", () => {
    // a place tagged both lodging and restaurant is treated as lodging
    expect(categoryFromTypes(["lodging", "restaurant"])).toBe("lodging");
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `bun test tests/places/category.test.ts`
Expected: FAIL — cannot resolve `@/lib/places/category`.

- [ ] **Step 3: Implement `lib/places/category.ts`**

```ts
export type PoiCategory = "food" | "sight" | "nature" | "lodging" | "other";

// Priority order matters: the first group with a matching type wins.
const CATEGORY_RULES: { category: PoiCategory; types: string[] }[] = [
  { category: "lodging", types: ["lodging", "hotel", "campground", "rv_park"] },
  {
    category: "nature",
    types: ["park", "natural_feature", "national_park", "hiking_area", "beach"],
  },
  {
    category: "food",
    types: ["restaurant", "cafe", "bar", "bakery", "meal_takeaway", "food"],
  },
  {
    category: "sight",
    types: [
      "tourist_attraction",
      "museum",
      "art_gallery",
      "church",
      "place_of_worship",
      "landmark",
      "zoo",
      "aquarium",
    ],
  },
];

export function categoryFromTypes(types: string[]): PoiCategory {
  const set = new Set(types);
  for (const rule of CATEGORY_RULES) {
    if (rule.types.some((t) => set.has(t))) return rule.category;
  }
  return "other";
}
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `bun test tests/places/category.test.ts`
Expected: PASS (6 cases).

- [ ] **Step 5: Commit**

```bash
git add lib/places/category.ts tests/places/category.test.ts
git commit -m "feat: add place-category mapping helper with tests"
```

---

## Task 2: Itinerary operations (addPoi / removePoi) — TDD

**Files:** create `lib/itinerary/operations.ts`; test `tests/itinerary/operations.test.ts`.

- [ ] **Step 1: Write the failing test** `tests/itinerary/operations.test.ts`:

```ts
import { test, expect, describe, beforeEach, afterAll } from "bun:test";
import { PrismaClient } from "@/lib/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { addPoi, removePoi } from "@/lib/itinerary/operations";
import { createTrip } from "@/lib/trips/service";
import type { CreateTripData } from "@/lib/trips/schema";

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
    title: "Trip",
    description: "desc",
    isRoundTrip: false,
    startDate: null,
    dayCount: 2,
    start: { name: "Florence", lat: 43.77, lng: 11.25, placeId: "p_start" },
    end: { name: "Rome", lat: 41.9, lng: 12.5, placeId: "p_end" },
  };
}

describe("addPoi", () => {
  test("adds a POI to the unassigned pool (dayId null, orderInDay null)", async () => {
    const trip = await createTrip(prisma, sampleTrip());
    const poi = await addPoi(prisma, trip.id, {
      name: "Uffizi",
      lat: 43.768,
      lng: 11.255,
      placeId: "p_uffizi",
      category: "sight",
      source: "search",
    });
    expect(poi.id).toBeTruthy();
    expect(poi.tripId).toBe(trip.id);
    expect(poi.dayId).toBeNull();
    expect(poi.orderInDay).toBeNull();
    expect(poi.status).toBe("accepted");
    expect(poi.source).toBe("search");
  });

  test("defaults source to 'user' and category to null when omitted", async () => {
    const trip = await createTrip(prisma, sampleTrip());
    const poi = await addPoi(prisma, trip.id, { name: "X", lat: 1, lng: 2 });
    expect(poi.source).toBe("user");
    expect(poi.category).toBeNull();
    expect(poi.placeId).toBeNull();
  });

  test("when added to a day, orderInDay is the next index in that day", async () => {
    const trip = await createTrip(prisma, sampleTrip());
    const dayId = trip.days[0].id;
    const a = await addPoi(prisma, trip.id, { name: "A", lat: 1, lng: 1, dayId });
    const b = await addPoi(prisma, trip.id, { name: "B", lat: 2, lng: 2, dayId });
    expect(a.orderInDay).toBe(0);
    expect(b.orderInDay).toBe(1);
  });
});

describe("removePoi", () => {
  test("removes a POI", async () => {
    const trip = await createTrip(prisma, sampleTrip());
    const poi = await addPoi(prisma, trip.id, { name: "X", lat: 1, lng: 2 });
    await removePoi(prisma, poi.id);
    expect(await prisma.poi.count()).toBe(0);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `bun run test`
Expected: the operations suite FAILS (cannot resolve `@/lib/itinerary/operations`); other suites still pass.

- [ ] **Step 3: Implement `lib/itinerary/operations.ts`**

```ts
import type { PrismaClient } from "@/lib/generated/prisma/client";

export type AddPoiInput = {
  name: string;
  lat: number;
  lng: number;
  placeId?: string | null;
  category?: string | null;
  source?: string; // "user" | "search" | "map" | "ai"
  dayId?: string | null;
};

export async function addPoi(
  prisma: PrismaClient,
  tripId: string,
  input: AddPoiInput,
) {
  let orderInDay: number | null = null;
  if (input.dayId) {
    orderInDay = await prisma.poi.count({ where: { dayId: input.dayId } });
  }
  return prisma.poi.create({
    data: {
      tripId,
      dayId: input.dayId ?? null,
      orderInDay,
      name: input.name,
      lat: input.lat,
      lng: input.lng,
      placeId: input.placeId ?? null,
      category: input.category ?? null,
      source: input.source ?? "user",
      status: "accepted",
    },
  });
}

export async function removePoi(prisma: PrismaClient, poiId: string) {
  return prisma.poi.delete({ where: { id: poiId } });
}
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `bun run test`
Expected: all suites pass, including the 4 new operations cases.

- [ ] **Step 5: Commit**

```bash
git add lib/itinerary/operations.ts tests/itinerary/operations.test.ts
git commit -m "feat: add addPoi/removePoi itinerary operations with tests"
```

---

## Task 3: Add-POI request schema (Zod) — TDD

**Files:** create `lib/itinerary/schema.ts`; test `tests/itinerary/schema.test.ts`.

- [ ] **Step 1: Write the failing test** `tests/itinerary/schema.test.ts`:

```ts
import { test, expect, describe } from "bun:test";
import { addPoiSchema } from "@/lib/itinerary/schema";

describe("addPoiSchema", () => {
  const base = { name: "Uffizi", lat: 43.768, lng: 11.255 };

  test("accepts the minimal valid body", () => {
    const r = addPoiSchema.safeParse(base);
    expect(r.success).toBe(true);
  });

  test("accepts optional fields", () => {
    const r = addPoiSchema.safeParse({
      ...base,
      placeId: "p1",
      category: "sight",
      source: "search",
      dayId: "day1",
    });
    expect(r.success).toBe(true);
  });

  test("rejects a missing name", () => {
    expect(addPoiSchema.safeParse({ lat: 1, lng: 2 }).success).toBe(false);
  });

  test("rejects non-numeric coordinates", () => {
    expect(addPoiSchema.safeParse({ name: "X", lat: "a", lng: 2 }).success).toBe(false);
  });

  test("rejects an unknown source", () => {
    expect(addPoiSchema.safeParse({ ...base, source: "bogus" }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `bun test tests/itinerary/schema.test.ts`
Expected: FAIL — cannot resolve `@/lib/itinerary/schema`.

- [ ] **Step 3: Implement `lib/itinerary/schema.ts`**

```ts
import { z } from "zod";

export const addPoiSchema = z.object({
  name: z.string().min(1, "Name is required"),
  lat: z.number(),
  lng: z.number(),
  placeId: z.string().optional(),
  category: z.string().optional(),
  source: z.enum(["user", "search", "map", "ai"]).optional(),
  dayId: z.string().optional(),
});

export type AddPoiBody = z.infer<typeof addPoiSchema>;
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `bun test tests/itinerary/schema.test.ts`
Expected: PASS (5 cases).

- [ ] **Step 5: Commit**

```bash
git add lib/itinerary/schema.ts tests/itinerary/schema.test.ts
git commit -m "feat: add addPoi request schema with tests"
```

---

## Task 4: API route — add a POI

**Files:** create `app/api/trips/[tripId]/pois/route.ts`.

- [ ] **Step 1: Create `app/api/trips/[tripId]/pois/route.ts`**

```ts
import { NextResponse } from "next/server";
import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/db";
import { addPoiSchema } from "@/lib/itinerary/schema";
import { addPoi } from "@/lib/itinerary/operations";

type Ctx = { params: Promise<{ tripId: string }> };

export async function POST(req: Request, { params }: Ctx) {
  const { tripId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = addPoiSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const poi = await addPoi(prisma, tripId, parsed.data);
    return NextResponse.json(poi, { status: 201 });
  } catch (e) {
    // Foreign-key failure → the trip (or day) doesn't exist
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003") {
      return NextResponse.json({ error: "Trip or day not found" }, { status: 404 });
    }
    throw e;
  }
}
```

- [ ] **Step 2: Verify the build type-checks**

Run: `bun run build`
Expected: build succeeds; the new route `ƒ /api/trips/[tripId]/pois` is listed. (Pre-existing Turbopack multi-lockfile warning is acceptable.)

- [ ] **Step 3: Commit**

```bash
git add app/api/trips/[tripId]/pois
git commit -m "feat: add POST /api/trips/[tripId]/pois route"
```

---

## Task 5: API route — remove a POI

**Files:** create `app/api/pois/[poiId]/route.ts`.

- [ ] **Step 1: Create `app/api/pois/[poiId]/route.ts`**

```ts
import { NextResponse } from "next/server";
import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/db";
import { removePoi } from "@/lib/itinerary/operations";

type Ctx = { params: Promise<{ poiId: string }> };

export async function DELETE(_req: Request, { params }: Ctx) {
  const { poiId } = await params;
  try {
    await removePoi(prisma, poiId);
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    throw e;
  }
}
```

- [ ] **Step 2: Verify the build**

Run: `bun run build`
Expected: build succeeds; `ƒ /api/pois/[poiId]` is listed.

- [ ] **Step 3: Commit**

```bash
git add app/api/pois
git commit -m "feat: add DELETE /api/pois/[poiId] route"
```

---

## Task 6: TanStack Query provider

**Files:** create `app/providers.tsx`; modify `app/layout.tsx`.

- [ ] **Step 1: Add the dependency**

Run: `bun add @tanstack/react-query`
Note the installed version in your report.

- [ ] **Step 2: Create `app/providers.tsx`**

```tsx
"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
```

- [ ] **Step 3: Wrap the app in `app/layout.tsx`**

Read the current `app/layout.tsx`. Keep everything (the `<html>`/`<body>`, fonts, metadata) and wrap ONLY the `{children}` inside `<body>` with `<Providers>`. Add the import at the top:
```tsx
import { Providers } from "@/app/providers";
```
and change the body content from `{children}` to:
```tsx
<Providers>{children}</Providers>
```

- [ ] **Step 4: Verify the build**

Run: `bun run build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add app/providers.tsx app/layout.tsx package.json bun.lock
git commit -m "feat: add TanStack Query provider"
```

---

## Task 7: Client fetchers + shared view types

**Files:** create `lib/api/trips.ts`.

- [ ] **Step 1: Create `lib/api/trips.ts`**

```ts
import type { AddPoiBody } from "@/lib/itinerary/schema";

export type PoiDetail = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  placeId: string | null;
  category: string | null;
  source: string;
  isOvernight: boolean;
  dayId: string | null;
  orderInDay: number | null;
  status: string;
};

export type DayDetail = {
  id: string;
  dayIndex: number;
  pois: PoiDetail[];
};

export type TripDetail = {
  id: string;
  title: string;
  description: string;
  startName: string;
  startLat: number;
  startLng: number;
  endName: string | null;
  endLat: number | null;
  endLng: number | null;
  isRoundTrip: boolean;
  days: DayDetail[];
  pois: PoiDetail[];
};

export async function fetchTrip(tripId: string): Promise<TripDetail> {
  const res = await fetch(`/api/trips/${tripId}`);
  if (!res.ok) throw new Error(`Failed to load trip (${res.status})`);
  return res.json();
}

export async function postPoi(tripId: string, body: AddPoiBody): Promise<PoiDetail> {
  const res = await fetch(`/api/trips/${tripId}/pois`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Failed to add place (${res.status})`);
  return res.json();
}

export async function deletePoi(poiId: string): Promise<void> {
  const res = await fetch(`/api/pois/${poiId}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Failed to remove place (${res.status})`);
}
```

- [ ] **Step 2: Verify the build**

Run: `bun run build`
Expected: build succeeds (this file is types + functions; nothing imports it yet, so just type-check).

- [ ] **Step 3: Commit**

```bash
git add lib/api/trips.ts
git commit -m "feat: add client trip fetchers and view types"
```

---

## Task 8: Query + mutation hooks

**Files:** create `hooks/use-trip.ts`, `hooks/use-poi-mutations.ts`.

- [ ] **Step 1: Create `hooks/use-trip.ts`**

```ts
import { useQuery } from "@tanstack/react-query";
import { fetchTrip } from "@/lib/api/trips";

export function tripQueryKey(tripId: string) {
  return ["trip", tripId] as const;
}

export function useTrip(tripId: string) {
  return useQuery({
    queryKey: tripQueryKey(tripId),
    queryFn: () => fetchTrip(tripId),
  });
}
```

- [ ] **Step 2: Create `hooks/use-poi-mutations.ts`**

```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { postPoi, deletePoi } from "@/lib/api/trips";
import type { AddPoiBody } from "@/lib/itinerary/schema";
import { tripQueryKey } from "@/hooks/use-trip";

export function useAddPoi(tripId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: AddPoiBody) => postPoi(tripId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: tripQueryKey(tripId) }),
  });
}

export function useRemovePoi(tripId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (poiId: string) => deletePoi(poiId),
    onSuccess: () => qc.invalidateQueries({ queryKey: tripQueryKey(tripId) }),
  });
}
```

- [ ] **Step 3: Verify the build**

Run: `bun run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add hooks/use-trip.ts hooks/use-poi-mutations.ts
git commit -m "feat: add useTrip query and poi mutation hooks"
```

---

## Task 9: Place-search component (new Places API)

**Files:** create `components/place-search.tsx`.

> Uses the **new** Places API. The legacy `google.maps.places.Autocomplete` widget is closed to new API customers, so we use `AutocompleteSuggestion.fetchAutocompleteSuggestions` + `Place.fetchFields`. The exact TS shapes come from `@types/google.maps` (already installed); if a property access below is typed slightly differently by the installed types (e.g. `mainText` is a `FormattableText` whose string is `.text`), adjust the access to satisfy the compiler — do not change the behavior.

- [ ] **Step 1: Create `components/place-search.tsx`**

```tsx
"use client";

import { useRef, useState } from "react";
import { useMapsLibrary } from "@vis.gl/react-google-maps";
import { Input } from "@/components/ui/input";
import { categoryFromTypes } from "@/lib/places/category";
import { useAddPoi } from "@/hooks/use-poi-mutations";

export function PlaceSearch({ tripId }: { tripId: string }) {
  const placesLib = useMapsLibrary("places");
  const addPoi = useAddPoi(tripId);
  const [value, setValue] = useState("");
  const [predictions, setPredictions] = useState<
    google.maps.places.PlacePrediction[]
  >([]);
  const sessionToken = useRef<google.maps.places.AutocompleteSessionToken | null>(null);

  async function onChange(input: string) {
    setValue(input);
    if (!placesLib || input.trim().length < 2) {
      setPredictions([]);
      return;
    }
    if (!sessionToken.current) {
      sessionToken.current = new placesLib.AutocompleteSessionToken();
    }
    const { suggestions } =
      await placesLib.AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input,
        sessionToken: sessionToken.current,
      });
    setPredictions(
      suggestions
        .map((s) => s.placePrediction)
        .filter((p): p is google.maps.places.PlacePrediction => p != null),
    );
  }

  async function onPick(prediction: google.maps.places.PlacePrediction) {
    const place = prediction.toPlace();
    await place.fetchFields({
      fields: ["location", "displayName", "id", "types"],
    });
    const loc = place.location;
    if (!loc) return;
    addPoi.mutate({
      name: place.displayName ?? prediction.mainText?.text ?? "Unnamed place",
      lat: loc.lat(),
      lng: loc.lng(),
      placeId: place.id ?? undefined,
      category: categoryFromTypes(place.types ?? []),
      source: "search",
    });
    setValue("");
    setPredictions([]);
    sessionToken.current = null; // end the billing session after a selection
  }

  return (
    <div className="relative">
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search a place to add…"
        aria-label="Search a place to add"
      />
      {predictions.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded-md border bg-background shadow">
          {predictions.map((p) => (
            <li key={p.placeId}>
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm hover:bg-accent"
                onClick={() => onPick(p)}
              >
                <span className="font-medium">{p.mainText?.text ?? p.text?.text}</span>
                {p.secondaryText?.text && (
                  <span className="block text-xs text-muted-foreground">
                    {p.secondaryText.text}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify the build type-checks**

Run: `bun run build`
Expected: build succeeds. If TypeScript flags a Places property shape, adjust the property access (not the logic) to match `@types/google.maps`, then re-run until green.

- [ ] **Step 3: Commit**

```bash
git add components/place-search.tsx
git commit -m "feat: add place-search autocomplete (new Places API)"
```

---

## Task 10: Make the planner client-driven (pool list + search + remove)

**Files:** modify `components/planner-shell.tsx`, `app/trips/[tripId]/page.tsx`.

> The planner now fetches via `useTrip` and shows: the search box, the unassigned pool with remove buttons, and the per-day sections (still read-only here — drag/drop and overnights are Phase 1b). The map shows start/end plus all accepted POIs.

- [ ] **Step 1: Rewrite `components/planner-shell.tsx`**

```tsx
"use client";

import { TripMap, type MapPoint } from "@/components/trip-map";
import { PlaceSearch } from "@/components/place-search";
import { useTrip } from "@/hooks/use-trip";
import { useAddPoi, useRemovePoi } from "@/hooks/use-poi-mutations";
import { Button } from "@/components/ui/button";
import type { AddPoiInput } from "@/lib/itinerary/operations";

export function PlannerShell({ tripId }: { tripId: string }) {
  const { data: trip, isLoading, isError } = useTrip(tripId);
  const addPoi = useAddPoi(tripId);
  const removePoi = useRemovePoi(tripId);

  if (isLoading) {
    return <div className="flex h-screen items-center justify-center text-sm text-muted-foreground">Loading trip…</div>;
  }
  if (isError || !trip) {
    return <div className="flex h-screen items-center justify-center text-sm text-red-600">Couldn’t load this trip.</div>;
  }

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
  const pool = trip.pois.filter((p) => p.dayId === null);

  // Clicking a POI icon on the map adds it to the pool via the same operation.
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

  return (
    <div className="flex h-screen w-full">
      <div className="relative flex-1">
        <TripMap start={start} end={end} pois={poiPoints} onAddPlace={handleAddFromMap} />
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
          <div className="mb-2 text-sm font-medium">
            Unassigned places ({pool.length})
          </div>
          {pool.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Search above or click a place on the map to add it.
            </p>
          ) : (
            <ul className="space-y-1">
              {pool.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                >
                  <span className="truncate">{p.name}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removePoi.mutate(p.id)}
                    aria-label={`Remove ${p.name}`}
                  >
                    ✕
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-3">
          {trip.days.map((day) => (
            <div key={day.id} className="rounded-md border p-3">
              <div className="mb-2 text-sm font-medium">Day {day.dayIndex + 1}</div>
              {day.pois.length === 0 ? (
                <p className="text-xs text-muted-foreground">No stops yet.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {day.pois.map((p) => (
                    <li key={p.id}>{p.name}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}
```

- [ ] **Step 2: Rewrite `app/trips/[tripId]/page.tsx`**

```tsx
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getTrip } from "@/lib/trips/service";
import { PlannerShell } from "@/components/planner-shell";

export const dynamic = "force-dynamic";

export default async function TripPage({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;
  // Server-side existence guard; the planner re-fetches client-side via useTrip.
  const trip = await getTrip(prisma, tripId);
  if (!trip) notFound();

  return <PlannerShell tripId={tripId} />;
}
```

- [ ] **Step 3: Verify the build**

Run: `bun run build`
Expected: build succeeds. NOTE: `TripMap` now receives an `onAddPlace` prop that doesn't exist yet — Task 11 adds it. If the build fails ONLY because `onAddPlace` isn't a known prop of `TripMap`, that's expected; proceed to Task 11 and build at its end. (If you prefer a green build at each task, you may do Task 11 before this step's build — both files must land together. Commit them in the order below regardless.)

- [ ] **Step 4: Commit**

```bash
git add components/planner-shell.tsx app/trips/[tripId]/page.tsx
git commit -m "feat: client-driven planner with pool list, search, and remove"
```

---

## Task 11: Clickable map POIs → add to pool

**Files:** modify `components/trip-map.tsx`.

> Add an optional `onAddPlace` callback. When the user clicks a Google basemap POI icon, the map click event carries a `placeId`; we fetch that place's details with the new Places API and hand a ready `AddPoiInput` to the callback.

- [ ] **Step 1: Modify `components/trip-map.tsx`**

Add the import for the operation input type at the top (next to the existing imports):
```tsx
import type { AddPoiInput } from "@/lib/itinerary/operations";
```

Change the `TripMap` props to accept `onAddPlace`:
```tsx
export function TripMap({
  start,
  end,
  pois = [],
  onAddPlace,
}: {
  start: MapPoint;
  end?: MapPoint | null;
  pois?: MapPoint[];
  onAddPlace?: (input: AddPoiInput) => void;
}) {
```

On the `<Map>` element, add an `onClick` handler (keep all existing props like `defaultCenter`, `defaultZoom`, `mapId`, `gestureHandling`, `style`):
```tsx
      <Map
        defaultCenter={{ lat: start.lat, lng: start.lng }}
        defaultZoom={7}
        mapId={mapId}
        gestureHandling="greedy"
        style={{ width: "100%", height: "100%" }}
        onClick={async (ev) => {
          const placeId = ev.detail.placeId;
          if (!placeId || !onAddPlace) return;
          ev.stop(); // suppress the default place info window
          const place = new google.maps.places.Place({ id: placeId });
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
```

Add the category import near the top:
```tsx
import { categoryFromTypes } from "@/lib/places/category";
```

> If `@types/google.maps` types `ev.detail.placeId` as possibly absent or `ev.stop` differently, adjust the access to satisfy the compiler without changing behavior. `new google.maps.places.Place({ id })` and `fetchFields` are the new-Places-API way to resolve a clicked icon.

- [ ] **Step 2: Verify the build**

Run: `bun run build`
Expected: build succeeds; `onAddPlace` now exists so Task 10's planner type-checks too.

- [ ] **Step 3: Commit**

```bash
git add components/trip-map.tsx
git commit -m "feat: add clickable map POIs that add to the pool"
```

---

## Task 12: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full test suite**

Run: `bun run test`
Expected: all suites pass (Phase 0 suites + category + operations + itinerary schema).

- [ ] **Step 2: Build**

Run: `bun run build`
Expected: success; routes include `ƒ /api/trips/[tripId]/pois` and `ƒ /api/pois/[poiId]`.

- [ ] **Step 3: Manual smoke test (requires a Google key with Maps JS + Places API (New) enabled in `.env`)**

Run `bun run dev`, then:
1. Create a trip (or open an existing one) → land on the planner.
2. In the **Search a place to add…** box, type a city/attraction → suggestions appear → click one → it shows under **Unassigned places** and a pin appears on the map.
3. Click a **POI icon directly on the map** → it’s added to the pool + a pin appears.
4. Click **✕** on a pool item → it disappears from the list and the map.
5. Reload the page → the pool persists (data is in SQLite).

Expected: all five work. If suggestions never appear or map-click adds nothing, confirm the **Places API (New)** is enabled for the key in Google Cloud and check the browser console for Places errors.

- [ ] **Step 4: Final commit (docs/notes, if any)**

```bash
git add -A
git commit -m "docs: phase 1a verified" --allow-empty
```

---

## Phase 1a Done — Definition of Done

- `bun run test` passes (adds category, operations, itinerary-schema suites).
- `bun run build` succeeds with the two new API routes.
- The planner is client-driven (TanStack Query); the user can add places by **search** and by **clicking map POIs**, see them as pins + in the **unassigned pool**, and **remove** them. Additions persist.
- All additions flow through the single `addPoi` operation (the shared keystone the AI will reuse).

**Next:** Phase 1b — drag/drop between days and the pool + reorder (dnd-kit), and overnight (🌙) toggling that moves day boundaries.
