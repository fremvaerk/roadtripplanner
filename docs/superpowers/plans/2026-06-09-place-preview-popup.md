# Place Preview Popup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace auto-adding places with a preview popup (map `InfoWindow`) showing photo/name/address/description + a "View on Google Maps" link and an "Add to Places" button; nothing is added until the button is clicked.

**Architecture:** A `preview` state in `planner-shell` ({placeId, position, source}) is set by map place-clicks and search picks (instead of adding). `TripMap` renders an `InfoWindow` + new `PlacePreview` component that lazily fetches rich Places fields and commits via the existing `useAddPoi` path. No backend changes.

**Tech Stack:** Next.js 16 / React 19, TypeScript, `@vis.gl/react-google-maps` (`InfoWindow`, `useMap`, `useMapsLibrary`), Google Places API (New) `Place.fetchFields`, Bun.

---

## File Structure

- **Create** `components/place-preview.tsx` — the popup card: fetches Places fields for a `placeId`, renders photo/name/address/description/maps-link + Add/Added button.
- **Modify** `components/trip-map.tsx` — map click opens a preview (no auto-add); render `InfoWindow`+`PlacePreview`; pan/zoom to the preview; new props.
- **Modify** `components/planner-shell.tsx` — `preview` state; master search via `PlaceAutocomplete` → preview; `addedPlaceIds`; add-and-close; source pass-through.
- **Delete** `components/place-search.tsx` — now unused.

No unit tests (UI + Google browser SDK); each task verifies with `bun run build`, and the feature is validated by the live smoke test in Task 4.

---

### Task 1: `PlacePreview` component

**Files:**
- Create: `components/place-preview.tsx`

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useMapsLibrary } from "@vis.gl/react-google-maps";
import { Button } from "@/components/ui/button";
import { categoryFromTypes } from "@/lib/places/category";
import type { AddPoiInput } from "@/lib/itinerary/operations";

type Details = {
  name: string;
  lat: number;
  lng: number;
  address: string | null;
  description: string | null;
  photoUrl: string | null;
  googleMapsUri: string | null;
  types: string[];
};

export function PlacePreview({
  placeId,
  position,
  source,
  alreadyAdded,
  onAdd,
}: {
  placeId: string;
  position: { lat: number; lng: number };
  source: "map" | "search";
  alreadyAdded: boolean;
  onAdd: (input: AddPoiInput) => void;
}) {
  const placesLib = useMapsLibrary("places");
  const [details, setDetails] = useState<Details | null>(null);
  const [loading, setLoading] = useState(true);
  const reqId = useRef(0);

  useEffect(() => {
    if (!placesLib) return;
    const id = ++reqId.current;
    setLoading(true);
    setDetails(null);
    (async () => {
      try {
        const place = new placesLib.Place({ id: placeId });
        await place.fetchFields({
          fields: [
            "displayName",
            "formattedAddress",
            "editorialSummary",
            "photos",
            "location",
            "types",
            "googleMapsURI",
            "id",
          ],
        });
        if (id !== reqId.current) return;
        const loc = place.location;
        setDetails({
          name: place.displayName ?? "Unnamed place",
          lat: loc ? loc.lat() : position.lat,
          lng: loc ? loc.lng() : position.lng,
          address: place.formattedAddress ?? null,
          description: place.editorialSummary ?? null,
          photoUrl: place.photos?.[0]?.getURI({ maxWidth: 320, maxHeight: 180 }) ?? null,
          googleMapsUri: place.googleMapsURI ?? null,
          types: place.types ?? [],
        });
      } catch {
        if (id !== reqId.current) return;
        // Graceful fallback: still addable using the known position.
        setDetails({
          name: "Unnamed place",
          lat: position.lat,
          lng: position.lng,
          address: null,
          description: null,
          photoUrl: null,
          googleMapsUri: null,
          types: [],
        });
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    })();
  }, [placesLib, placeId, position.lat, position.lng]);

  if (loading || !details) {
    return <div className="w-64 p-1 text-sm text-muted-foreground">Loading…</div>;
  }

  const mapsUri =
    details.googleMapsUri ?? `https://www.google.com/maps/place/?q=place_id:${placeId}`;

  return (
    <div className="w-64 text-sm text-foreground">
      {details.photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={details.photoUrl}
          alt={details.name}
          className="mb-2 h-32 w-full rounded object-cover"
        />
      ) : null}
      <div className="font-medium">{details.name}</div>
      {details.address ? (
        <div className="mt-0.5 text-xs text-muted-foreground">{details.address}</div>
      ) : null}
      {details.description ? <p className="mt-1 text-xs">{details.description}</p> : null}
      <a
        href={mapsUri}
        target="_blank"
        rel="noreferrer"
        className="mt-1 block text-xs text-blue-600 underline"
      >
        View on Google Maps
      </a>
      <Button
        size="sm"
        className="mt-2 h-7 w-full text-xs"
        disabled={alreadyAdded}
        onClick={() =>
          onAdd({
            name: details.name,
            lat: details.lat,
            lng: details.lng,
            placeId,
            category: categoryFromTypes(details.types),
            source,
          })
        }
      >
        {alreadyAdded ? "Added ✓" : "Add to Places"}
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Build to verify types**

Run: `bun run build`
Expected: build succeeds. (If TypeScript complains that `editorialSummary`/`googleMapsURI` are possibly absent on the `Place` type, they are optional string fields in the Places API typings; the `?? null` handles it. Do not add casts unless the compiler genuinely errors — if it does, narrow with `(place as google.maps.places.Place).editorialSummary ?? null` style access, but try the plain access first.)

- [ ] **Step 3: Commit**

```bash
git add components/place-preview.tsx
git -c user.name="Anatolii Lapytskyi" -c user.email="anatolii.lapytskyi@gmail.com" commit -m "feat(places): PlacePreview popup card (photo, address, description, add button)"
```
(Project rule: no AI co-author trailer.)

---

### Task 2: Wire the preview into `TripMap`

**Files:**
- Modify: `components/trip-map.tsx`

Current `onClick` auto-adds the clicked place. We change it to open a preview, render the `InfoWindow`+`PlacePreview`, pan/zoom to the preview, and add the new props. `placesLib`/`categoryFromTypes` are no longer used in this file after the change.

- [ ] **Step 1: Update imports**

In `components/trip-map.tsx`, change the vis.gl import to add `InfoWindow`:

```tsx
import {
  Map,
  AdvancedMarker,
  Pin,
  InfoWindow,
  useMap,
  useMapsLibrary,
} from "@vis.gl/react-google-maps";
```

Remove the now-unused `categoryFromTypes` import line:

```tsx
import { categoryFromTypes } from "@/lib/places/category";
```

Add the `PlacePreview` import after the `nearest-leg` import:

```tsx
import { PlacePreview } from "@/components/place-preview";
```

- [ ] **Step 2: Add the new props**

In the destructured params (after `onSetNight,`) add:

```tsx
  preview = null,
  onPreviewPlace,
  onPreviewClose,
  addedPlaceIds,
```

In the props type object (after the `onSetNight?: ...` line) add:

```tsx
  preview?: { placeId: string; position: { lat: number; lng: number }; source: "map" | "search" } | null;
  onPreviewPlace?: (placeId: string, position: { lat: number; lng: number }, source: "map" | "search") => void;
  onPreviewClose?: () => void;
  addedPlaceIds?: Set<string>;
```

- [ ] **Step 3: Replace `placesLib` with a map handle + pan effect**

The body currently starts:

```tsx
  const mapId = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID ?? "DEMO_MAP_ID";
  const placesLib = useMapsLibrary("places");
  const geometryLib = useMapsLibrary("geometry");
  const [menu, setMenu] = useState<{ x: number; y: number; lat: number; lng: number } | null>(null);
```

Replace those four lines with (drop `placesLib`, add `useMap` handle):

```tsx
  const mapId = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID ?? "DEMO_MAP_ID";
  const map = useMap();
  const geometryLib = useMapsLibrary("geometry");
  const [menu, setMenu] = useState<{ x: number; y: number; lat: number; lng: number } | null>(null);

  // Pan/zoom to a freshly opened preview so it's in view (esp. for search picks).
  useEffect(() => {
    if (!map || !preview) return;
    map.panTo(preview.position);
    if ((map.getZoom() ?? 0) < 13) map.setZoom(13);
  }, [map, preview]);
```

- [ ] **Step 4: Replace the `onClick` handler (preview instead of add)**

Replace the entire existing `onClick={async (ev) => { ... }}` prop on `<Map ...>` with:

```tsx
      onClick={(ev) => {
        const placeId = ev.detail.placeId;
        const ll = ev.detail.latLng;
        if (!placeId || !ll || !onPreviewPlace) return;
        ev.stop();
        onPreviewPlace(placeId, { lat: ll.lat, lng: ll.lng }, "map");
      }}
```

- [ ] **Step 5: Render the InfoWindow inside the map**

Find the `<FitBounds points={boundsPoints} />` line near the end of the `<Map>` children and add the InfoWindow immediately before it:

```tsx
      {preview && onAddPlace && (
        <InfoWindow position={preview.position} onCloseClick={() => onPreviewClose?.()}>
          <PlacePreview
            placeId={preview.placeId}
            position={preview.position}
            source={preview.source}
            alreadyAdded={addedPlaceIds?.has(preview.placeId) ?? false}
            onAdd={(input) => onAddPlace(input)}
          />
        </InfoWindow>
      )}

      <FitBounds points={boundsPoints} />
```

- [ ] **Step 6: Build to verify types**

Run: `bun run build`
Expected: build succeeds with no unused-symbol errors (confirm `placesLib` and `categoryFromTypes` are fully removed; `useMap` is imported — it already is, used by `RouteLegs`/`FitBounds`).

- [ ] **Step 7: Commit**

```bash
git add components/trip-map.tsx
git -c user.name="Anatolii Lapytskyi" -c user.email="anatolii.lapytskyi@gmail.com" commit -m "feat(map): open a place preview on click; render InfoWindow + pan to preview"
```

---

### Task 3: Wire `planner-shell` + delete `place-search`

**Files:**
- Modify: `components/planner-shell.tsx`
- Delete: `components/place-search.tsx`

`planner-shell` already imports `useState` and `PlaceAutocomplete`. It currently renders `<PlaceSearch tripId={tripId} />` and has `handleAddFromMap` (hardcoding `source: "map"`).

- [ ] **Step 1: Remove the `PlaceSearch` import**

Delete this line near the top of `components/planner-shell.tsx`:

```tsx
import { PlaceSearch } from "@/components/place-search";
```

- [ ] **Step 2: Add preview state**

After the existing hook declarations (e.g. right after `const setNight = useSetNight(tripId);` or alongside the other `useState` calls in the component body, but it must be before the early `if (isLoading)` returns), add:

```tsx
  const [preview, setPreview] = useState<
    { placeId: string; position: { lat: number; lng: number }; source: "map" | "search" } | null
  >(null);
```

- [ ] **Step 3: Compute `addedPlaceIds` and update `handleAddFromMap`**

Find the existing `handleAddFromMap` function:

```tsx
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
```

Replace it with (pass the source through, and close the popup after adding); add the `addedPlaceIds` set just above it:

```tsx
  const addedPlaceIds = new Set(
    trip.pois.map((p) => p.placeId).filter((x): x is string => !!x),
  );

  function handleAddFromMap(input: AddPoiInput) {
    addPoi.mutate({
      name: input.name,
      lat: input.lat,
      lng: input.lng,
      placeId: input.placeId ?? undefined,
      category: input.category ?? undefined,
      source: input.source ?? "map",
    });
    setPreview(null);
  }
```

- [ ] **Step 4: Pass the preview props to `TripMap`**

In the `<TripMap ... />` element, after the `onSetNight={...}` prop (the last existing prop), add:

```tsx
              preview={preview}
              onPreviewPlace={(placeId, position, source) =>
                setPreview({ placeId, position, source })
              }
              onPreviewClose={() => setPreview(null)}
              addedPlaceIds={addedPlaceIds}
```

- [ ] **Step 5: Replace the master search with `PlaceAutocomplete` → preview**

Replace:

```tsx
            <PlaceSearch tripId={tripId} />
```

with:

```tsx
            <PlaceAutocomplete
              placeholder="Search a place to add…"
              ariaLabel="Search a place to add"
              onPick={(p) => {
                if (p.placeId)
                  setPreview({
                    placeId: p.placeId,
                    position: { lat: p.lat, lng: p.lng },
                    source: "search",
                  });
              }}
            />
```

- [ ] **Step 6: Delete the unused component**

```bash
git rm components/place-search.tsx
```

- [ ] **Step 7: Build to verify types**

Run: `bun run build`
Expected: build succeeds; no remaining references to `PlaceSearch`.

- [ ] **Step 8: Commit**

```bash
git add components/planner-shell.tsx
git -c user.name="Anatolii Lapytskyi" -c user.email="anatolii.lapytskyi@gmail.com" commit -m "feat(planner): preview places before adding; search opens preview; drop PlaceSearch"
```

---

### Task 4: Verification

**Files:** none (validation only)

- [ ] **Step 1: Full test suite**

Run: `bun run test`
Expected: all existing tests pass (this feature adds no unit tests but must not break any).

- [ ] **Step 2: Production build**

Run: `bun run build`
Expected: succeeds, no type errors.

- [ ] **Step 3: Live smoke test**

Start `bun run dev`, open an existing trip. Verify:
1. Click a place icon on the map → a popup shows a photo (when available), name, address, description, and a "View on Google Maps" link; the place is **not** added (Places count unchanged).
2. Click **Add to Places** → the place appears in the master list; the popup closes.
3. Type in the sidebar search and pick a result → the map pans/zooms to it and the popup opens there (not auto-added).
4. Re-open a place that is already in the trip → the button reads **Added ✓** and is disabled.
5. "View on Google Maps" opens the place in a new tab.
6. Press the popup ✕ → it closes with nothing added. Open a place with no photo/description → those rows are simply absent, no layout break. No console errors.

- [ ] **Step 4: Final review + merge**

Dispatch a final code review over the branch diff, fix anything above threshold, then merge to `main` per superpowers:finishing-a-development-branch.

---

## Notes for the implementer

- **No backend changes.** Adding still flows through `useAddPoi` → `POST /api/trips/[tripId]/pois`. The preview only *reads* extra Places fields client-side.
- **`InfoWindow` must be a child of `<Map>`** (it uses the map context) — that's why it's rendered among the map markers, not next to the DOM context-menu overlay.
- **`source` pass-through:** map-preview adds are tagged `"map"`, search-preview adds `"search"`, via `PlacePreview`'s `source` prop → `onAdd`.
- **Already-added** is computed from `trip.pois[].placeId`; the popup button disables when the clicked place's id is in that set.
</content>
