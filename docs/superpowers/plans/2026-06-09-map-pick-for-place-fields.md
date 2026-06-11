# Click the Map to Fill a Focused Place Field — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user fill any place-search field (start/finish/add/night-set/night-move) by clicking a place on the map, via an "armed target" so the lost focus doesn't matter.

**Architecture:** A `MapPickProvider` context (inside `APIProvider`, wrapping map + sidebar) holds the armed field's `onPick` (ref) + `armedId` (state). `PlaceAutocomplete` arms on focus when given a `pickId` and shows a ring. The map, when a field is armed, resolves the clicked place to a `PlacePick` and calls the armed `onPick` (same callback as a typed result), with a crosshair cursor. Escape disarms. No backend changes.

**Tech Stack:** Next.js 16 / React 19, TypeScript, `@vis.gl/react-google-maps` (Map onClick, useMapsLibrary), React Context, Bun.

---

## File Structure

- **Create** `components/map-pick-context.tsx` — the armed-target context (`MapPickProvider`, `useMapPick`).
- **Modify** `components/place-autocomplete.tsx` — optional `pickId` arming + ring.
- **Modify** `components/trip-map.tsx` — armed-fill branch (Places fetch → consume) + crosshair cursor.
- **Modify** `components/planner-shell.tsx` — mount `MapPickProvider`; add `pickId` to the 3 fields.
- **Modify** `components/day-night.tsx` — add `pickId` to the 2 night fields.

No unit tests (React context + browser Google SDK); each task verifies with `bun run build`, validated by the live smoke test in Task 4.

---

### Task 1: `MapPickProvider` context

**Files:**
- Create: `components/map-pick-context.tsx`

- [ ] **Step 1: Create the context**

```tsx
"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { PlacePick } from "@/components/place-autocomplete";

type MapPickContextValue = {
  armedId: string | null;
  arm: (id: string, onPick: (p: PlacePick) => void) => void;
  disarm: (id?: string) => void;
  consume: (p: PlacePick) => boolean;
};

const MapPickContext = createContext<MapPickContextValue | null>(null);

export function MapPickProvider({ children }: { children: React.ReactNode }) {
  const onPickRef = useRef<((p: PlacePick) => void) | null>(null);
  const [armedId, setArmedId] = useState<string | null>(null);

  const arm = useCallback((id: string, onPick: (p: PlacePick) => void) => {
    onPickRef.current = onPick;
    setArmedId(id);
  }, []);

  const disarm = useCallback((id?: string) => {
    setArmedId((cur) => {
      if (id !== undefined && id !== cur) return cur; // stale id: leave the current target armed
      onPickRef.current = null;
      return null;
    });
  }, []);

  const consume = useCallback((p: PlacePick) => {
    const fn = onPickRef.current;
    if (!fn) return false;
    fn(p);
    onPickRef.current = null;
    setArmedId(null);
    return true;
  }, []);

  useEffect(() => {
    if (!armedId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onPickRef.current = null;
        setArmedId(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [armedId]);

  return (
    <MapPickContext.Provider value={{ armedId, arm, disarm, consume }}>
      {children}
    </MapPickContext.Provider>
  );
}

export function useMapPick(): MapPickContextValue | null {
  return useContext(MapPickContext);
}
```

(The `import type { PlacePick }` is erased at compile time, so even though `place-autocomplete.tsx` will import `useMapPick` from this file in Task 2, there is no runtime import cycle.)

- [ ] **Step 2: Build**

Run: `bun run build`
Expected: succeeds (the file is exported but not yet used).

- [ ] **Step 3: Commit**

```bash
git add components/map-pick-context.tsx
git -c user.name="Anatolii Lapytskyi" -c user.email="anatolii.lapytskyi@gmail.com" commit -m "feat(map): MapPick context for an armed map-pick target"
```
(Project rule: no AI co-author trailer.)

---

### Task 2: `PlaceAutocomplete` arming via `pickId`

**Files:**
- Modify: `components/place-autocomplete.tsx`

- [ ] **Step 1: Add the `pickId` prop + arming**

In `components/place-autocomplete.tsx`, add the import:

```tsx
import { useMapPick } from "@/components/map-pick-context";
```

Add `pickId` to the destructured props and the props type:

```tsx
export function PlaceAutocomplete({
  placeholder,
  onPick,
  ariaLabel,
  className,
  pickId,
}: {
  placeholder: string;
  onPick: (p: PlacePick) => void;
  ariaLabel?: string;
  className?: string;
  pickId?: string;
}) {
```

In the function body, after `const placesLib = useMapsLibrary("places");`, add:

```tsx
  const mapPick = useMapPick();
  const armed = !!pickId && mapPick?.armedId === pickId;
```

In the `pick(prediction)` function, after the existing `onPick({ ... })` call (before or after `setValue("")` — anywhere after `onPick`), add a disarm:

```tsx
    if (pickId && mapPick) mapPick.disarm(pickId);
```

Replace the `<Input ... />` element with one that arms on focus, shows the armed ring, and disarms on Escape:

```tsx
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => {
          if (pickId && mapPick) mapPick.arm(pickId, onPick);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape" && pickId && mapPick) {
            mapPick.disarm(pickId);
            (e.currentTarget as HTMLInputElement).blur();
          }
        }}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        className={armed ? "ring-2 ring-blue-500" : undefined}
      />
```

- [ ] **Step 2: Build**

Run: `bun run build`
Expected: succeeds. (`pickId` is optional, so existing usages without it are unaffected.)

- [ ] **Step 3: Commit**

```bash
git add components/place-autocomplete.tsx
git -c user.name="Anatolii Lapytskyi" -c user.email="anatolii.lapytskyi@gmail.com" commit -m "feat(places): arm a place field for map-picking on focus (pickId)"
```

---

### Task 3: Map armed-fill + crosshair; wire the provider + pickIds

**Files:**
- Modify: `components/trip-map.tsx`, `components/planner-shell.tsx`, `components/day-night.tsx`

- [ ] **Step 1: `trip-map` — Places lib, context, armed-fill onClick, crosshair**

In `components/trip-map.tsx`, add imports:

```tsx
import { useMapPick } from "@/components/map-pick-context";
import type { PlacePick } from "@/components/place-autocomplete";
```

In the `TripMap` body, after `const map = useMap();`, add:

```tsx
  const placesLib = useMapsLibrary("places");
  const mapPick = useMapPick();
```

Replace the `<Map>` `onClick` handler with:

```tsx
      onClick={async (ev) => {
        const placeId = ev.detail.placeId;
        const ll = ev.detail.latLng;
        if (!placeId || !ll) return;
        ev.stop();
        if (mapPick?.armedId && placesLib) {
          let pick: PlacePick = { name: "Unnamed place", lat: ll.lat, lng: ll.lng, placeId, types: [] };
          try {
            const place = new placesLib.Place({ id: placeId });
            await place.fetchFields({ fields: ["location", "displayName", "id", "types"] });
            const loc = place.location;
            pick = {
              name: place.displayName ?? "Unnamed place",
              lat: loc ? loc.lat() : ll.lat,
              lng: loc ? loc.lng() : ll.lng,
              placeId: place.id ?? placeId,
              types: place.types ?? [],
            };
          } catch {
            // keep the click-coordinate fallback
          }
          mapPick.consume(pick);
          return;
        }
        if (onPreviewPlace) onPreviewPlace(placeId, { lat: ll.lat, lng: ll.lng }, "map");
      }}
```

Change the relative wrapper `<div>` (the one that opens the return, `<div className="relative h-full w-full">`) to add the crosshair when armed:

```tsx
    <div className={`relative h-full w-full ${mapPick?.armedId ? "cursor-crosshair" : ""}`}>
```

- [ ] **Step 2: `planner-shell` — mount the provider**

In `components/planner-shell.tsx`, add the import:

```tsx
import { MapPickProvider } from "@/components/map-pick-context";
```

Wrap the inner flex container with the provider. Change:

```tsx
  return (
    <APIProvider apiKey={apiKey}>
      <div className="flex h-screen w-full">
```
to:
```tsx
  return (
    <APIProvider apiKey={apiKey}>
      <MapPickProvider>
      <div className="flex h-screen w-full">
```
and find the matching close of that flex `<div>` immediately before `</APIProvider>` and change:
```tsx
      </div>
    </APIProvider>
```
to:
```tsx
      </div>
      </MapPickProvider>
    </APIProvider>
```

- [ ] **Step 3: `planner-shell` — add the 3 pickIds**

On the "Change start…" `PlaceAutocomplete`, add `pickId="start"`:
```tsx
                    <PlaceAutocomplete
                      placeholder="Change start…"
                      pickId="start"
                      onPick={(p) =>
```
On the "Search destination…" `PlaceAutocomplete`, add `pickId="finish"`:
```tsx
                        <PlaceAutocomplete
                          placeholder="Search destination…"
                          pickId="finish"
                          onPick={(p) =>
```
On the "Search a place to add…" `PlaceAutocomplete`, add `pickId="add"`:
```tsx
            <PlaceAutocomplete
              placeholder="Search a place to add…"
              ariaLabel="Search a place to add"
              pickId="add"
              onPick={(p) => {
```

- [ ] **Step 4: `day-night` — add the 2 night pickIds**

On the "Where will you sleep?" `PlaceAutocomplete`, add `pickId={\`night-set:${dayId}\`}`:
```tsx
      <PlaceAutocomplete
        placeholder="🛏️ Where will you sleep? (search address)"
        className="mt-1"
        pickId={`night-set:${dayId}`}
        onPick={(p) => setNight.mutate({ dayId, lat: p.lat, lng: p.lng, title: p.name })}
      />
```
On the "📍 Change location…" `PlaceAutocomplete`, add `pickId={\`night-move:${dayId}\`}`:
```tsx
      <PlaceAutocomplete
        placeholder="📍 Change location…"
        className="mt-1"
        pickId={`night-move:${dayId}`}
        onPick={(p) => updateNight.mutate({ dayId, lat: p.lat, lng: p.lng })}
      />
```
(The `NightEditor` already has `dayId` in scope where the second one lives; the first is in the `DayNight` body which also has `dayId`. Confirm both have `dayId` available — they do, both receive it as a prop.)

- [ ] **Step 5: Build**

Run: `bun run build`
Expected: succeeds.

- [ ] **Step 6: Commit**

```bash
git add components/trip-map.tsx components/planner-shell.tsx components/day-night.tsx
git -c user.name="Anatolii Lapytskyi" -c user.email="anatolii.lapytskyi@gmail.com" commit -m "feat(map): fill an armed place field on map click; crosshair cursor; wire pickIds"
```

---

### Task 4: Verification

**Files:** none (validation only)

- [ ] **Step 1: Full test suite**

Run: `bun run test`
Expected: all existing tests pass (this feature adds none but must not break any).

- [ ] **Step 2: Production build**

Run: `bun run build`
Expected: succeeds.

- [ ] **Step 3: Live smoke test**

Start `bun run dev`, open a trip. Verify:
1. Click the **Change start…** field → it shows a colored ring and the map cursor becomes a crosshair → click a place icon on the map → the trip's **start** updates (green marker + route move), **no** preview popup opens, and the ring/crosshair clear.
2. Set the finish to **Place**, focus **Search destination…**, click a map place → the **destination** is set (red marker).
3. On a day, focus **🛏️ Where will you sleep?**, click a map place → a **night** is set there for that day; on a set night, focus **📍 Change location…**, click a map place → the night **relocates**.
4. Focus a field (ring + crosshair appear), press **Escape** → ring and crosshair clear; a following map place-click opens the **preview popup** (default).
5. With nothing focused/armed, a map place-click still opens the **preview popup**. No console errors.

- [ ] **Step 4: Final review + merge**

Dispatch a final code review over the branch diff, fix anything above threshold, then merge to `main` per superpowers:finishing-a-development-branch.

---

## Notes for the implementer

- **The armed `onPick` is the field's existing one** — a map-picked `PlacePick` flows through the same handler as a typed search result, so no per-field branching.
- **`disarm(id)` ignores a stale id** so an Escape/blur from a field that's already been replaced as the armed target can't clear the new one.
- **`trip-map` re-adds `useMapsLibrary("places")`** (removed when preview-fetching moved into `PlacePreview`); it's used only for the armed-fill resolution. `PlacePreview` keeps its own fetch.
- **No provider → graceful**: `useMapPick()` returns null; fields skip arming and the map uses the default preview behavior.
</content>
