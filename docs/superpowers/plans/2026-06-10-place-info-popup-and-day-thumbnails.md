# Place Info Popup + Day Thumbnails Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Left-click a Place marker to open an info popup (photo/name/category/description/address + Edit/Remove/Maps link) that lazily enriches un-enriched places from Google and caches the result; and show image thumbnails on place cards in the Days section.

**Architecture:** Extend the POI edit API to persist `address`/`placeId`. A new `PlaceInfoPopup` shows the place's stored data and, on first open of an un-enriched place, fetches a Google photo + address (by `placeId` or a nearby search at its coords), persists them via `useUpdatePoi`, and reuses the existing `onEditPoi`/`onRemovePoi` callbacks. `TripMap` opens it in an `InfoWindow` on a marker left-click. `PoiCard` mirrors the master-list thumbnail.

**Tech Stack:** Next.js 16, React 19, TypeScript, Prisma 7, TanStack Query, `@vis.gl/react-google-maps` (Google Places), Bun.

---

## Reference (current code)

- `patchPoiSchema` op `"edit"` (`lib/itinerary/schema.ts`): `name?`, `description?` (nullable), `imageUrl?` (url nullable).
- `updatePoi(prisma, poiId, patch)` (`lib/itinerary/operations.ts`): sets `name`/`description`/`imageUrl`.
- `updatePoiRequest(poiId, patch)` and `useUpdatePoi(tripId)` (`lib/api/trips.ts`, `hooks/use-poi-mutations.ts`): send op `"edit"`; the hook invalidates the trip query.
- `PlacePreview` (`components/place-preview.tsx`) shows the fetch/photo pattern: `new placesLib.Place({id}).fetchFields({fields:[…]})`, `place.photos?.[0]?.getURI({ maxWidth, maxHeight })`, `place.formattedAddress`.
- `PoiMarker` (`components/trip-map.tsx`, ~line 408) renders `<AdvancedMarker … clickable>` with a `contextmenu` listener; rendered in the `pois.map(…)` block (~line 188) with `onPoiContextMenu`.
- `TripMap` props already include `onEditPoi?(poiId)` / `onRemovePoi?(poiId)`; the existing Google-POI `InfoWindow`/`PlacePreview` block is ~line 264.
- `CatalogRow` thumbnail: `{poi.imageUrl && poi.imageUrl !== brokenUrl ? <img … className="h-7 w-7 shrink-0 rounded object-cover" onError={() => setBrokenUrl(poi.imageUrl)} /> : null}` with `const [brokenUrl,setBrokenUrl]=useState<string|null>(null)` + `useEffect(()=>setBrokenUrl(null),[poi.imageUrl])`.

---

## Task 1: Persist `address`/`placeId` on POI edit

**Files:**
- Modify: `lib/itinerary/schema.ts`, `lib/itinerary/operations.ts`, `lib/api/trips.ts`, `hooks/use-poi-mutations.ts`
- Test: `tests/itinerary/update-poi.test.ts` (create)

- [ ] **Step 1: Write the failing service test**

Create `tests/itinerary/update-poi.test.ts`:
```ts
import { test, expect, describe, beforeEach, afterAll } from "bun:test";
import { PrismaClient } from "@/lib/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { createTrip } from "@/lib/trips/service";
import { updatePoi } from "@/lib/itinerary/operations";

const prisma = new PrismaClient({
  adapter: new PrismaLibSql({ url: process.env.DATABASE_URL ?? "file:./test.db" }),
});

beforeEach(async () => {
  await prisma.poi.deleteMany();
  await prisma.day.deleteMany();
  await prisma.trip.deleteMany();
});
afterAll(async () => { await prisma.$disconnect(); });

describe("updatePoi", () => {
  test("sets address and placeId (enrichment cache)", async () => {
    const trip = await createTrip(prisma, {
      title: "T", description: "", startDate: null, dayCount: 1,
      start: { name: "S", lat: 0, lng: 0, placeId: null },
    });
    const poi = await prisma.poi.create({
      data: { tripId: trip.id, name: "X", lat: 1, lng: 2, placeId: null, source: "ai" },
    });
    const updated = await updatePoi(prisma, poi.id, {
      imageUrl: "https://example.com/p.jpg", address: "Somewhere 1", placeId: "place_123",
    });
    expect(updated.imageUrl).toBe("https://example.com/p.jpg");
    expect(updated.address).toBe("Somewhere 1");
    expect(updated.placeId).toBe("place_123");
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `bun run test 2>&1 | tail -8`
Expected: FAIL — `updatePoi` ignores `address`/`placeId` (assertions on them fail).

- [ ] **Step 3: Extend `updatePoi`**

In `lib/itinerary/operations.ts`, change the `updatePoi` patch type and body:
```ts
export async function updatePoi(
  prisma: PrismaClient,
  poiId: string,
  patch: { name?: string; description?: string | null; imageUrl?: string | null; address?: string | null; placeId?: string | null },
) {
  const data: { name?: string; description?: string | null; imageUrl?: string | null; address?: string | null; placeId?: string | null } = {};
  if (patch.name !== undefined) data.name = patch.name;
  if (patch.description !== undefined) data.description = patch.description;
  if (patch.imageUrl !== undefined) data.imageUrl = patch.imageUrl;
  if (patch.address !== undefined) data.address = patch.address;
  if (patch.placeId !== undefined) data.placeId = patch.placeId;
  return prisma.poi.update({ where: { id: poiId }, data });
}
```

- [ ] **Step 4: Extend the schema**

In `lib/itinerary/schema.ts`, in the `op: "edit"` object of `patchPoiSchema`, add after `imageUrl`:
```ts
    address: z.string().nullable().optional(),
    placeId: z.string().nullable().optional(),
```

- [ ] **Step 5: Extend the client helper + hook**

In `lib/api/trips.ts`, widen the `updatePoiRequest` patch type:
```ts
export async function updatePoiRequest(
  poiId: string,
  patch: { name?: string; description?: string | null; imageUrl?: string | null; address?: string | null; placeId?: string | null },
): Promise<void> {
```
In `hooks/use-poi-mutations.ts`, widen the `useUpdatePoi` mutation variables type:
```ts
    mutationFn: (v: { poiId: string; name?: string; description?: string | null; imageUrl?: string | null; address?: string | null; placeId?: string | null }) => {
```

- [ ] **Step 6: Run — expect PASS; build**

Run: `bun run test 2>&1 | tail -6` → all pass.
Run: `bun run build 2>&1 | tail -5` → "✓ Compiled successfully".

- [ ] **Step 7: Commit**

```bash
git add lib/itinerary/schema.ts lib/itinerary/operations.ts lib/api/trips.ts hooks/use-poi-mutations.ts tests/itinerary/update-poi.test.ts
git commit -m "feat(pois): persist address/placeId via the edit API (enrichment cache)"
```

---

## Task 2: `googleMapsUrl` helper

**Files:**
- Create: `lib/places/maps-url.ts`
- Test: `tests/places/maps-url.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/places/maps-url.test.ts`:
```ts
import { test, expect, describe } from "bun:test";
import { googleMapsUrl } from "@/lib/places/maps-url";

describe("googleMapsUrl", () => {
  test("builds a query-by-coordinates link", () => {
    expect(googleMapsUrl(59.9, 10.7)).toBe(
      "https://www.google.com/maps/search/?api=1&query=59.9,10.7",
    );
  });
  test("includes the place id when known", () => {
    expect(googleMapsUrl(59.9, 10.7, "place_123")).toBe(
      "https://www.google.com/maps/search/?api=1&query=59.9,10.7&query_place_id=place_123",
    );
  });
  test("null place id is omitted", () => {
    expect(googleMapsUrl(1, 2, null)).toBe(
      "https://www.google.com/maps/search/?api=1&query=1,2",
    );
  });
});
```

- [ ] **Step 2: Run — expect FAIL**, then **Step 3: Implement**

Create `lib/places/maps-url.ts`:
```ts
/** A Google Maps link to a point, biased to a specific place when its id is known. */
export function googleMapsUrl(lat: number, lng: number, placeId?: string | null): string {
  const base = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  return placeId ? `${base}&query_place_id=${placeId}` : base;
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `bun run test 2>&1 | tail -6` → all pass.

- [ ] **Step 5: Commit**

```bash
git add lib/places/maps-url.ts tests/places/maps-url.test.ts
git commit -m "feat(places): googleMapsUrl helper"
```

---

## Task 3: `PlaceInfoPopup`

**Files:**
- Create: `components/place-info-popup.tsx`

- [ ] **Step 1: Create the component**

Create `components/place-info-popup.tsx`:
```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useMapsLibrary } from "@vis.gl/react-google-maps";
import { Button } from "@/components/ui/button";
import { useUpdatePoi } from "@/hooks/use-poi-mutations";
import { googleMapsUrl } from "@/lib/places/maps-url";
import type { PoiDetail } from "@/lib/api/trips";

export function PlaceInfoPopup({
  poi,
  tripId,
  onEdit,
  onRemove,
}: {
  poi: PoiDetail;
  tripId: string;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const placesLib = useMapsLibrary("places");
  const updatePoi = useUpdatePoi(tripId);
  const [enriched, setEnriched] = useState<{ imageUrl: string | null; address: string | null } | null>(null);
  const startedRef = useRef(false);

  const needsEnrich = !poi.imageUrl && !poi.address;

  useEffect(() => {
    if (!needsEnrich || !placesLib || startedRef.current) return;
    startedRef.current = true;
    (async () => {
      try {
        let place: google.maps.places.Place | null = null;
        if (poi.placeId) {
          place = new placesLib.Place({ id: poi.placeId });
          await place.fetchFields({ fields: ["photos", "formattedAddress", "id"] });
        } else {
          const { places } = await placesLib.Place.searchNearby({
            fields: ["photos", "formattedAddress", "id"],
            locationRestriction: { center: { lat: poi.lat, lng: poi.lng }, radius: 150 },
            maxResultCount: 1,
            rankPreference: placesLib.SearchNearbyRankPreference.DISTANCE,
          });
          place = places[0] ?? null;
        }
        if (!place) return;
        const imageUrl = place.photos?.[0]?.getURI({ maxWidth: 400, maxHeight: 240 }) ?? null;
        const address = place.formattedAddress ?? null;
        const placeId = place.id ?? poi.placeId ?? null;
        setEnriched({ imageUrl, address });
        if (imageUrl || address) {
          updatePoi.mutate({ poiId: poi.id, imageUrl: imageUrl ?? undefined, address, placeId });
        }
      } catch {
        // keep the stored info on any fetch/search failure
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placesLib]);

  const imageUrl = poi.imageUrl ?? enriched?.imageUrl ?? null;
  const address = poi.address ?? enriched?.address ?? null;

  return (
    <div className="w-64 text-sm text-foreground">
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt={poi.name} className="mb-2 h-32 w-full rounded object-cover" />
      ) : null}
      <div className="font-medium">{poi.name}</div>
      {poi.category ? <div className="text-xs text-muted-foreground">{poi.category}</div> : null}
      {address ? <div className="mt-0.5 text-xs text-muted-foreground">{address}</div> : null}
      {poi.description ? <p className="mt-1 text-xs">{poi.description}</p> : null}
      <a
        href={googleMapsUrl(poi.lat, poi.lng, poi.placeId)}
        target="_blank"
        rel="noreferrer"
        className="mt-1 block text-xs text-blue-600 underline"
      >
        View on Google Maps
      </a>
      <div className="mt-2 flex gap-2">
        <Button size="sm" variant="outline" className="h-7 flex-1 text-xs" onClick={onEdit}>
          ✎ Edit
        </Button>
        <Button size="sm" variant="destructive" className="h-7 flex-1 text-xs" onClick={onRemove}>
          ✕ Remove
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build**

Run: `bun run build 2>&1 | tail -5` → "✓ Compiled successfully" (not yet used; must type-check). If `placesLib.SearchNearbyRankPreference` or `Place.searchNearby` type-errors, this Google Maps types version differs — adjust to the available API (e.g. the string `"DISTANCE"` for `rankPreference`), keeping the same behavior, and note it.

- [ ] **Step 3: Commit**

```bash
git add components/place-info-popup.tsx
git commit -m "feat(map): PlaceInfoPopup (stored info + lazy Google enrichment + actions)"
```

---

## Task 4: Open the popup on a marker left-click (`trip-map.tsx` + `planner-shell.tsx`)

**Files:**
- Modify: `components/trip-map.tsx`, `components/planner-shell.tsx`

- [ ] **Step 1: Imports + props (`trip-map.tsx`)**

Add imports:
```ts
import { PlaceInfoPopup } from "@/components/place-info-popup";
import type { PoiDetail } from "@/lib/api/trips";
```
(The existing `import type { RouteLegResult, TripVia } from "@/lib/api/trips";` can stay; add `PoiDetail` there or in a new line.)

In the `TripMap` destructured params (after `onRemovePoi,`), add:
```ts
  tripId,
  placeDetails = [],
```
In the props type (after `onRemovePoi?: (poiId: string) => void;`), add:
```ts
  tripId: string;
  placeDetails?: PoiDetail[];
```

- [ ] **Step 2: Selection state**

After the existing `const [poiMenu, setPoiMenu] = useState<…>(null);` line, add:
```ts
  const [selectedPoiId, setSelectedPoiId] = useState<string | null>(null);
```

- [ ] **Step 3: `PoiMarker` gets a left-click**

Change the `PoiMarker` component signature and the marker element:
```tsx
function PoiMarker({
  point,
  onSelect,
  onPoiContextMenu,
}: {
  point: MapPoint;
  onSelect: (point: MapPoint) => void;
  onPoiContextMenu: (e: MouseEvent, point: MapPoint) => void;
}) {
```
and change `<AdvancedMarker ref={markerRef} position={point} title={point.name} clickable>` to:
```tsx
    <AdvancedMarker ref={markerRef} position={point} title={point.name} clickable onClick={() => onSelect(point)}>
```

In the `pois.map(…)` render, add the `onSelect` prop to `<PoiMarker …>`:
```tsx
          onSelect={(p) => { if (p.id) setSelectedPoiId(p.id); }}
```

- [ ] **Step 4: Render the popup**

Immediately after the existing Google-POI preview block (`{preview && ( <InfoWindow…><PlacePreview…/></InfoWindow> )}`), add:
```tsx
      {(() => {
        const sel = selectedPoiId ? placeDetails.find((p) => p.id === selectedPoiId) : null;
        return sel ? (
          <InfoWindow position={{ lat: sel.lat, lng: sel.lng }} onCloseClick={() => setSelectedPoiId(null)}>
            <PlaceInfoPopup
              poi={sel}
              tripId={tripId}
              onEdit={() => { onEditPoi?.(sel.id); setSelectedPoiId(null); }}
              onRemove={() => { onRemovePoi?.(sel.id); setSelectedPoiId(null); }}
            />
          </InfoWindow>
        ) : null;
      })()}
```

- [ ] **Step 5: Pass props from `planner-shell.tsx`**

In the `<TripMap … />` usage, add (e.g. after `onRemovePoi={(id) => removePoi.mutate(id)}`):
```tsx
              tripId={tripId}
              placeDetails={trip.pois}
```

- [ ] **Step 6: Build + tests**

Run: `bun run build 2>&1 | tail -5` → "✓ Compiled successfully", no type errors.
Run: `bun run test 2>&1 | tail -5` → all pass.

- [ ] **Step 7: Commit**

```bash
git add components/trip-map.tsx components/planner-shell.tsx
git commit -m "feat(map): left-click a place opens PlaceInfoPopup"
```

---

## Task 5: Thumbnails on `PoiCard`

**Files:**
- Modify: `components/poi-card.tsx`

- [ ] **Step 1: Add the thumbnail**

In `components/poi-card.tsx`:
- ensure `useEffect` is imported: `import { useState, useEffect } from "react";`
- after the existing `const [editing, setEditing] = useState(false);`, add:
  ```ts
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null);
  useEffect(() => { setBrokenUrl(null); }, [poi.imageUrl]);
  ```
- in the returned `<li>`, immediately **before** `<span className="flex-1 truncate">{poi.name}</span>`, insert:
  ```tsx
      {poi.imageUrl && poi.imageUrl !== brokenUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={poi.imageUrl}
          alt=""
          onError={() => setBrokenUrl(poi.imageUrl)}
          className="h-7 w-7 shrink-0 rounded object-cover"
        />
      ) : null}
  ```

- [ ] **Step 2: Build**

Run: `bun run build 2>&1 | tail -5` → "✓ Compiled successfully".

- [ ] **Step 3: Commit**

```bash
git add components/poi-card.tsx
git commit -m "feat(itinerary): show place thumbnails on day cards"
```

---

## Task 6: Verification

**Files:** none.

- [ ] **Step 1: Tests + build**

Run: `bun run test 2>&1 | tail -6` → all pass.
Run: `bun run build 2>&1 | tail -5` → "✓ Compiled successfully".

- [ ] **Step 2: Live smoke (port 5001)**

Restart the dev server if needed (`bun run dev` now serves **:5001**), open the Norway trip:
1. **Left-click** a migrated place marker (e.g. *Bryggen* or *Trolltunga*) → an info popup opens; within a moment it shows a **photo + address** (enriched from Google) plus the description, an Edit/Remove row and a Google Maps link.
2. **Close and reopen** the same place → it shows instantly from stored data (no second fetch); the **Days** card for that place now shows a **thumbnail**.
3. **Edit** opens the `PlaceEditor`; **Remove** deletes the place; **right-click** still shows the quick menu.
4. No console errors.

- [ ] **Step 3: Final review + finish**

Dispatch a final review over `git diff main...HEAD` against the spec. Apply high-confidence fixes, then use `superpowers:finishing-a-development-branch` to merge to `main` (`--no-ff`, delete branch).

---

## Notes for the implementer

- Enrichment runs once per popup mount (`startedRef`) and only when the place has neither `imageUrl` nor `address`. It persists via `useUpdatePoi` (invalidates the trip query), which also makes the day thumbnail appear.
- The popup reuses the existing `onEditPoi`/`onRemovePoi` callbacks (Edit opens the editor in `planner-shell`; Remove uses `useRemovePoi`), so no new edit/remove logic.
- `placesLib.Place.searchNearby` + `SearchNearbyRankPreference.DISTANCE` are the new Places API; if the installed `@types/google.maps` differs, adapt (e.g. `rankPreference: "DISTANCE"`) while preserving behavior — the live smoke confirms it.
- Don't overwrite `name`/`description` during enrichment (only `imageUrl`/`address`/`placeId`).
