# Night Location Search & Map Right-Click Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user place a night stop at a precise location via address search (in each day's editor) or a map right-click menu, and add route waypoints (vias) by right-clicking the map (snapped to the nearest leg).

**Architecture:** Frontend-only — the backend already accepts night coordinates (`setNight`/`updateNight`) and computes via sequence (`addVia`). We extract the existing Places autocomplete into a reusable `PlaceAutocomplete`, reuse it in the night editor, add a custom DOM context menu over the map, and add one pure `nearestLeg` helper to anchor right-click vias.

**Tech Stack:** Next.js 16 / React 19, TypeScript, `@vis.gl/react-google-maps` (Map `onContextmenu`, geometry library for polyline decode), TanStack Query mutations, Bun test.

---

## File Structure

- **Create** `lib/routing/nearest-leg.ts` — pure helper: given decoded leg paths + their `afterPoiId`, return the closest leg to a point.
- **Create** `tests/routing/nearest-leg.test.ts` — unit tests for the helper.
- **Create** `components/place-autocomplete.tsx` — reusable Places autocomplete (input + predictions dropdown), calls `onPick`.
- **Modify** `components/place-search.tsx` — thin wrapper over `PlaceAutocomplete` (adds a POI).
- **Modify** `components/day-night.tsx` — empty-state night search; "change location" search when set.
- **Modify** `components/trip-map.tsx` — right-click menu (add-waypoint + set-night-for-day), wraps `<Map>` in a relative container, decodes leg paths for `nearestLeg`.
- **Modify** `components/planner-shell.tsx` — pass `dayChoices` + `onSetNight` to `TripMap`; `onSetNight` picks `setNight` vs `updateNight` so metadata is preserved.

---

### Task 1: `nearestLeg` pure helper

**Files:**
- Create: `lib/routing/nearest-leg.ts`
- Test: `tests/routing/nearest-leg.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/routing/nearest-leg.test.ts`:

```ts
import { test, expect, describe } from "bun:test";
import { nearestLeg, type LegPath } from "@/lib/routing/nearest-leg";

const legs: LegPath[] = [
  { afterPoiId: null, coords: [{ lat: 0, lng: 0 }, { lat: 0, lng: 1 }] }, // along the equator
  { afterPoiId: "p1", coords: [{ lat: 5, lng: 0 }, { lat: 5, lng: 1 }] }, // ~555 km north
];

describe("nearestLeg", () => {
  test("returns the leg whose polyline is closest to the point", () => {
    expect(nearestLeg(legs, { lat: 0.1, lng: 0.5 })?.afterPoiId).toBe(null);
    expect(nearestLeg(legs, { lat: 4.9, lng: 0.5 })?.afterPoiId).toBe("p1");
  });

  test("returns null when there are no legs", () => {
    expect(nearestLeg([], { lat: 0, lng: 0 })).toBeNull();
  });

  test("handles a single-vertex leg by measuring distance to that vertex", () => {
    const one: LegPath[] = [{ afterPoiId: "x", coords: [{ lat: 0, lng: 0 }] }];
    expect(nearestLeg(one, { lat: 1, lng: 1 })?.afterPoiId).toBe("x");
  });

  test("a point essentially on a leg resolves to that leg", () => {
    expect(nearestLeg(legs, { lat: 5, lng: 0.5 })?.afterPoiId).toBe("p1");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `DATABASE_URL="file:./test.db" bun test tests/routing/nearest-leg.test.ts`
Expected: FAIL — `Cannot find module '@/lib/routing/nearest-leg'`.

- [ ] **Step 3: Write the implementation**

Create `lib/routing/nearest-leg.ts`:

```ts
export type LatLng = { lat: number; lng: number };
export type LegPath = { afterPoiId: string | null; coords: LatLng[] };

const R = 6_371_000; // earth radius (m)
const toRad = (d: number) => (d * Math.PI) / 180;

/** Project to local planar metres around `ref` (equirectangular; accurate at trip scale). */
function toXY(p: LatLng, ref: LatLng): { x: number; y: number } {
  return {
    x: (toRad(p.lng) - toRad(ref.lng)) * Math.cos(toRad(ref.lat)) * R,
    y: (toRad(p.lat) - toRad(ref.lat)) * R,
  };
}

function distToSegment(p: LatLng, a: LatLng, b: LatLng): number {
  const P = toXY(p, p);
  const A = toXY(a, p);
  const B = toXY(b, p);
  const dx = B.x - A.x;
  const dy = B.y - A.y;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq === 0 ? 0 : ((P.x - A.x) * dx + (P.y - A.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = A.x + t * dx;
  const cy = A.y + t * dy;
  return Math.hypot(P.x - cx, P.y - cy);
}

function distToPath(p: LatLng, coords: LatLng[]): number {
  if (coords.length === 0) return Infinity;
  if (coords.length === 1) return distToSegment(p, coords[0], coords[0]);
  let min = Infinity;
  for (let i = 0; i < coords.length - 1; i++) {
    const d = distToSegment(p, coords[i], coords[i + 1]);
    if (d < min) min = d;
  }
  return min;
}

/** The leg whose polyline runs closest to `point`, or null if there are no legs. */
export function nearestLeg(legs: LegPath[], point: LatLng): LegPath | null {
  let best: LegPath | null = null;
  let bestDist = Infinity;
  for (const leg of legs) {
    const d = distToPath(point, leg.coords);
    if (d < bestDist) {
      bestDist = d;
      best = leg;
    }
  }
  return best;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `DATABASE_URL="file:./test.db" bun test tests/routing/nearest-leg.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/routing/nearest-leg.ts tests/routing/nearest-leg.test.ts
git -c user.name="Anatolii Lapytskyi" -c user.email="anatolii.lapytskyi@gmail.com" commit -m "feat(routing): nearestLeg helper for snapping a point to the closest route leg"
```

---

### Task 2: Extract reusable `PlaceAutocomplete`

**Files:**
- Create: `components/place-autocomplete.tsx`
- Modify: `components/place-search.tsx`

This has no unit test (it depends on the Google Places browser SDK); correctness is covered by the live smoke test in Task 5. Verify with the type-check/build step below.

- [ ] **Step 1: Create `components/place-autocomplete.tsx`**

```tsx
"use client";

import { useRef, useState } from "react";
import { useMapsLibrary } from "@vis.gl/react-google-maps";
import { Input } from "@/components/ui/input";

export type PlacePick = {
  name: string;
  lat: number;
  lng: number;
  placeId: string | null;
  types: string[];
};

export function PlaceAutocomplete({
  placeholder,
  onPick,
  ariaLabel,
  className,
}: {
  placeholder: string;
  onPick: (p: PlacePick) => void;
  ariaLabel?: string;
  className?: string;
}) {
  const placesLib = useMapsLibrary("places");
  const [value, setValue] = useState("");
  const [predictions, setPredictions] = useState<google.maps.places.PlacePrediction[]>([]);
  const sessionToken = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const reqId = useRef(0);

  async function onChange(input: string) {
    setValue(input);
    if (!placesLib || input.trim().length < 2) {
      setPredictions([]);
      return;
    }
    if (!sessionToken.current) {
      sessionToken.current = new placesLib.AutocompleteSessionToken();
    }
    const id = ++reqId.current;
    const { suggestions } =
      await placesLib.AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input,
        sessionToken: sessionToken.current,
      });
    if (id !== reqId.current) return; // a newer keystroke superseded this response
    setPredictions(
      suggestions
        .map((s) => s.placePrediction)
        .filter((p): p is google.maps.places.PlacePrediction => p != null),
    );
  }

  async function pick(prediction: google.maps.places.PlacePrediction) {
    const place = prediction.toPlace();
    await place.fetchFields({ fields: ["location", "displayName", "id", "types"] });
    const loc = place.location;
    if (!loc) return;
    onPick({
      name: place.displayName ?? prediction.mainText?.text ?? "Unnamed place",
      lat: loc.lat(),
      lng: loc.lng(),
      placeId: place.id ?? null,
      types: place.types ?? [],
    });
    setValue("");
    setPredictions([]);
    sessionToken.current = null;
  }

  return (
    <div className={`relative ${className ?? ""}`}>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
      />
      {predictions.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded-md border bg-background shadow">
          {predictions.map((p) => (
            <li key={p.placeId}>
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm hover:bg-accent"
                onClick={() => pick(p)}
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

- [ ] **Step 2: Rewrite `components/place-search.tsx` as a thin wrapper**

Replace the entire file contents with:

```tsx
"use client";

import { PlaceAutocomplete } from "@/components/place-autocomplete";
import { categoryFromTypes } from "@/lib/places/category";
import { useAddPoi } from "@/hooks/use-poi-mutations";

export function PlaceSearch({ tripId }: { tripId: string }) {
  const addPoi = useAddPoi(tripId);
  return (
    <PlaceAutocomplete
      placeholder="Search a place to add…"
      ariaLabel="Search a place to add"
      onPick={(p) =>
        addPoi.mutate({
          name: p.name,
          lat: p.lat,
          lng: p.lng,
          placeId: p.placeId ?? undefined,
          category: categoryFromTypes(p.types),
          source: "search",
        })
      }
    />
  );
}
```

- [ ] **Step 3: Type-check / build**

Run: `bun run build`
Expected: build succeeds (no type errors). If `addPoi.mutate` rejects `placeId: undefined`, confirm the existing `AddPoiInput` allows `placeId?: string` — it does (the old code passed `place.id ?? undefined`).

- [ ] **Step 4: Commit**

```bash
git add components/place-autocomplete.tsx components/place-search.tsx
git -c user.name="Anatolii Lapytskyi" -c user.email="anatolii.lapytskyi@gmail.com" commit -m "refactor: extract reusable PlaceAutocomplete from PlaceSearch"
```

---

### Task 3: Night editor — search to set & to relocate

**Files:**
- Modify: `components/day-night.tsx`

Current behaviour: empty state renders a `🛏️ Set night` button that drops a marker at `fallback`; set state renders `NightEditor` (title/url/notes + clear). We replace the button with a search, and add a relocate-search inside the editor. The `setNight`/`updateNight`/`clearNight` hooks already exist and are already used in this file.

- [ ] **Step 1: Replace the empty-state button with a search**

In `components/day-night.tsx`, add the import at the top (after the existing imports):

```tsx
import { PlaceAutocomplete } from "@/components/place-autocomplete";
```

Replace the entire `if (!night) { ... }` block with:

```tsx
  if (!night) {
    return (
      <PlaceAutocomplete
        placeholder="🛏️ Where will you sleep? (search address)"
        className="mt-1"
        onPick={(p) => setNight.mutate({ dayId, lat: p.lat, lng: p.lng, title: p.name })}
      />
    );
  }
```

(The `fallback` prop and the `setNight`/`useSetNight` import are still used here, so leave them.)

- [ ] **Step 2: Add a "change location" search inside `NightEditor`**

`NightEditor` already receives `dayId` and `updateNight`. Add the import is already done in Step 1. Inside `NightEditor`'s returned JSX, immediately after the `<Textarea ... />` for notes and before the closing `</div>`, add:

```tsx
      <PlaceAutocomplete
        placeholder="📍 Change location…"
        className="mt-1"
        onPick={(p) => updateNight.mutate({ dayId, lat: p.lat, lng: p.lng })}
      />
```

- [ ] **Step 3: Build to verify types**

Run: `bun run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add components/day-night.tsx
git -c user.name="Anatolii Lapytskyi" -c user.email="anatolii.lapytskyi@gmail.com" commit -m "feat(night): set night by address search; relocate without losing metadata"
```

---

### Task 4: Map right-click menu (set-night + add-waypoint)

**Files:**
- Modify: `components/trip-map.tsx`
- Modify: `components/planner-shell.tsx`

The menu is a flat sectioned DOM overlay (not a hover submenu) for robustness: an "Add waypoint here" item (only when the route has legs) plus a "Set night for:" section listing each day as a button. It is positioned `fixed` at the cursor and closes on Escape or outside click.

- [ ] **Step 1: Extend `TripMap` props and imports**

In `components/trip-map.tsx`, update the imports at the top:

```tsx
import { useEffect, useMemo, useRef, useState } from "react";
```

Add these imports below the existing `@/lib/...` imports:

```tsx
import { nearestLeg, type LegPath } from "@/lib/routing/nearest-leg";
```

Add two props to the `TripMap` destructured params (after `onMoveNight`):

```tsx
  dayChoices = [],
  onSetNight,
```

And add their types to the props type object (after the `onMoveNight?` line):

```tsx
  dayChoices?: { id: string; label: string }[];
  onSetNight?: (dayId: string, lat: number, lng: number) => void;
```

- [ ] **Step 2: Decode leg paths and add menu state**

Inside the `TripMap` function body, after the existing `const placesLib = useMapsLibrary("places");` line, add:

```tsx
  const geometryLib = useMapsLibrary("geometry");
  const [menu, setMenu] = useState<{ x: number; y: number; lat: number; lng: number } | null>(null);

  const legPaths: LegPath[] = useMemo(() => {
    if (!geometryLib) return [];
    return legs
      .filter((l) => l.encodedPolyline)
      .map((l) => ({
        afterPoiId: l.afterPoiId,
        coords: geometryLib.encoding
          .decodePath(l.encodedPolyline as string)
          .map((p) => ({ lat: p.lat(), lng: p.lng() })),
      }));
  }, [geometryLib, legs]);

  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menu]);
```

- [ ] **Step 3: Add the `onContextmenu` handler to `<Map>`**

In the `<Map ...>` opening tag, after the existing `onClick={...}` handler prop, add:

```tsx
      onContextmenu={(ev) => {
        const ll = ev.detail.latLng;
        const dom = ev.domEvent as MouseEvent | undefined;
        if (!ll || !dom) return;
        ev.stop();
        dom.preventDefault?.(); // suppress the native browser context menu
        setMenu({ x: dom.clientX, y: dom.clientY, lat: ll.lat, lng: ll.lng });
      }}
```

- [ ] **Step 4: Wrap the `<Map>` in a relative container and render the menu**

Change the component's top-level return so `<Map>...</Map>` is wrapped. Replace the line:

```tsx
  return (
    <Map
```

with:

```tsx
  return (
    <div className="relative h-full w-full">
    <Map
```

Then find the closing `</Map>` near the end of the component (right before the final `);`) and replace:

```tsx
      <FitBounds points={boundsPoints} />
    </Map>
  );
}
```

with:

```tsx
      <FitBounds points={boundsPoints} />
    </Map>
    {menu && (
      <>
        <div className="fixed inset-0 z-20" onClick={() => setMenu(null)} />
        <div
          className="fixed z-30 min-w-44 rounded-md border bg-background py-1 text-sm shadow-md"
          style={{ left: menu.x, top: menu.y }}
        >
          {legPaths.length > 0 && (
            <button
              type="button"
              className="block w-full px-3 py-1.5 text-left hover:bg-accent"
              onClick={() => {
                const leg = nearestLeg(legPaths, { lat: menu.lat, lng: menu.lng });
                if (leg && onAddVia) onAddVia(leg.afterPoiId, menu.lat, menu.lng);
                setMenu(null);
              }}
            >
              ➕ Add waypoint here
            </button>
          )}
          {dayChoices.length > 0 && onSetNight && (
            <>
              <div className="border-t px-3 pb-1 pt-2 text-xs text-muted-foreground">
                Set night for:
              </div>
              {dayChoices.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  className="block w-full px-3 py-1.5 text-left hover:bg-accent"
                  onClick={() => {
                    onSetNight(d.id, menu.lat, menu.lng);
                    setMenu(null);
                  }}
                >
                  🛏️ {d.label}
                </button>
              ))}
            </>
          )}
        </div>
      </>
    )}
    </div>
  );
}
```

- [ ] **Step 5: Wire `dayChoices` and `onSetNight` from the planner**

In `components/planner-shell.tsx`, update the night-mutations import (line 16) to also import `useSetNight`:

```tsx
import { useUpdateNight, useSetNight } from "@/hooks/use-night-mutations";
```

After the existing `const updateNight = useUpdateNight(tripId);` (line 56), add:

```tsx
  const setNight = useSetNight(tripId);
```

In the `<TripMap ... />` element (around line 126–138), after the `onMoveNight={...}` prop, add:

```tsx
              dayChoices={trip.days.map((d) => ({
                id: d.id,
                label: formatDayDate(trip.startDate, d.dayIndex)
                  ? `Day ${d.dayIndex + 1} · ${formatDayDate(trip.startDate, d.dayIndex)}`
                  : `Day ${d.dayIndex + 1}`,
              }))}
              onSetNight={(dayId, lat, lng) => {
                const day = trip.days.find((d) => d.id === dayId);
                if (day?.night) updateNight.mutate({ dayId, lat, lng });
                else setNight.mutate({ dayId, lat, lng });
              }}
```

- [ ] **Step 6: Build to verify types**

Run: `bun run build`
Expected: build succeeds. (`formatDayDate` is defined at module scope in `planner-shell.tsx`, so it is in scope where `dayChoices` is built.)

- [ ] **Step 7: Commit**

```bash
git add components/trip-map.tsx components/planner-shell.tsx
git -c user.name="Anatolii Lapytskyi" -c user.email="anatolii.lapytskyi@gmail.com" commit -m "feat(map): right-click menu to set a day's night or add a waypoint (snapped to nearest leg)"
```

---

### Task 5: Verification

**Files:** none (validation only)

- [ ] **Step 1: Run the full test suite**

Run: `bun run test`
Expected: all tests pass (the suite from before plus the 4 new `nearestLeg` tests).

- [ ] **Step 2: Production build**

Run: `bun run build`
Expected: succeeds with no type errors.

- [ ] **Step 3: Live smoke test (dev server)**

Start the dev server (`bun run dev`) and open an existing multi-day trip. Verify:
1. On a day with **no night**, the editor shows a "🛏️ Where will you sleep?" search; typing an address and picking a result creates the night at that location with the title pre-filled to the place name.
2. On a day **with a night**, the "📍 Change location…" search relocates the marker while the title/url/notes you entered remain unchanged.
3. **Right-click** on empty map space shows the menu; "Set night for: Day N" places that day's night at the cursor (and the 🛏️ marker appears there). Right-clicking and choosing a day that already has a night **moves** it and keeps its title/url/notes.
4. With a built route, **right-click** near a road and choose "➕ Add waypoint here" — a via diamond appears on the nearest leg and the route reshapes. When there is **no** route yet, the "Add waypoint here" item is absent.
5. Escape or clicking elsewhere closes the menu. No console errors.

- [ ] **Step 4: Final review + merge**

Dispatch a final code review over the branch diff, address anything above the confidence threshold, then merge to `main` per superpowers:finishing-a-development-branch.

---

## Notes for the implementer

- **No backend changes.** `setNight` (upsert, sets lat/lng + optional title/url/notes), `updateNight` (patch incl. lat/lng), and `addVia` (computes `seq`) already exist, as do their API routes, Zod schemas, and the `useSetNight`/`useUpdateNight`/`useAddVia` hooks.
- **Metadata preservation** is the whole reason `onSetNight` branches: `setNight` is an upsert that would reset title/url/notes, so an already-set day must go through `updateNight` (lat/lng only).
- **Why a flat menu, not a hover submenu:** fewer moving parts, no pointer-tracking bugs; the "Set night for:" section lists days directly. This satisfies the spec's intent ("pick which day sleeps there").
- The right-click via reuses the existing `onAddVia(afterPoiId, lat, lng)` path, so seq/ordering and the per-leg attribution all keep working.
</content>
