# Click the Map to Fill a Focused Place Field — Design

**Date:** 2026-06-09
**Status:** Approved design, ready for implementation planning
**Type:** Feature on the existing roadtripplanner

## Summary

When the user focuses a place-search field (Change start, Search destination,
Search a place to add, Where will you sleep, Change location), they can fill it by
**clicking a place on the map** instead of typing. Because a map click blurs the
field, we track an **armed target** rather than live focus: focusing a field arms
it (shows a colored ring + a crosshair map cursor), and a subsequent map click on a
place feeds that field through its existing `onPick`. Cancel is **Escape only**
(picking a place or arming another field also clears it).

## Goals

- Each of the 5 place fields can be "armed" by focusing it.
- A map place-click while a field is armed fills that field (same effect as a typed
  search result), then disarms.
- An armed field shows a colored ring; the map shows a crosshair cursor.
- Escape disarms. An unarmed map place-click keeps today's behavior (opens the
  place preview popup).

## Non-Goals (YAGNI / per user choices)

- Click-empty-map-to-cancel (cancel is Escape only).
- Arming non-place fields.
- Changing the unarmed map-click default (still opens the preview).
- File/marker theming.

## Architecture

### `components/map-pick-context.tsx` (new)

A React context holding the armed map-pick target. Mounted **inside `APIProvider`**
so it wraps both the map and the sidebar.

```ts
import type { PlacePick } from "@/components/place-autocomplete";

type MapPickCtx = {
  armedId: string | null;                                   // for the highlight + cursor
  arm: (id: string, onPick: (p: PlacePick) => void) => void;
  disarm: (id?: string) => void;                            // no-op if id !== armedId
  consume: (p: PlacePick) => boolean;                       // calls armed onPick, disarms; false if none
};
```

`MapPickProvider`:
- keeps the armed `onPick` in a `useRef` (not state — avoids re-renders / stale closures) and `armedId` in `useState` (drives the ring + cursor).
- `arm` sets both; `disarm(id?)` clears only if `id` is omitted or equals the current `armedId`; `consume(p)` calls the ref'd `onPick(p)`, clears, returns true (false if nothing armed).
- a `useEffect` keyed on `armedId` adds a window `keydown` listener that disarms on `Escape` (only while something is armed).

`useMapPick()` returns the context (or null when no provider — fields/map handle that gracefully).

### `components/place-autocomplete.tsx` (changed)

Add an optional prop **`pickId?: string`**. When present and a `MapPick` context
exists:
- `onFocus` of the `<Input>` → `mapPick.arm(pickId, onPick)`.
- the input shows an armed ring when `mapPick.armedId === pickId` (e.g.
  `ring-2 ring-blue-500`).
- the existing search-pick path also calls `mapPick.disarm(pickId)` after `onPick`.
- `onKeyDown` Escape → `mapPick.disarm(pickId)` and blur the input.
When `pickId` is absent, behavior is exactly as today (no arming).

### `components/trip-map.tsx` (changed)

- Re-add `const placesLib = useMapsLibrary("places");` (removed when the preview
  feature moved fetching into `PlacePreview`); used only for the armed-fill path.
- Read `const mapPick = useMapPick();`.
- In the `<Map>` `onClick`:
  - if `placeId && ll && mapPick?.armedId && placesLib`: `ev.stop()`, fetch the
    `Place({ id })` fields `["location","displayName","id","types"]`, build a
    `PlacePick` (fall back to the click `ll` + "Unnamed place" on missing
    location/error), call `mapPick.consume(pick)`, and return.
  - else keep the current default: if `placeId && ll && onPreviewPlace` →
    `onPreviewPlace(...)`.
  - empty-map clicks (no `placeId`) do nothing (cancel is Escape-only).
- The relative map wrapper `<div>` gets `cursor-crosshair` while `mapPick?.armedId`
  is set (e.g. `className={\`relative h-full w-full ${mapPick?.armedId ? "cursor-crosshair" : ""}\`}`).

### `components/planner-shell.tsx` (changed)

- Wrap the inner flex container (inside `APIProvider`) in `<MapPickProvider>`.
- Pass `pickId="start"` / `pickId="finish"` / `pickId="add"` to the three
  `PlaceAutocomplete`s (Change start, Search destination, Search a place to add).

### `components/day-night.tsx` (changed)

- Pass `pickId={\`night-set:${dayId}\`}` to the "Where will you sleep?" autocomplete
  and `pickId={\`night-move:${dayId}\`}` to the "Change location" autocomplete.

## Data Flow

A map-picked place is resolved into the same `PlacePick` shape a typed result
produces, then handed to the field's **existing `onPick`** — so each field reacts
identically whether the place came from search or the map:
- start → `updateBase.mutate({ start })`
- finish → `updateBase.mutate({ finish: { mode: "place", place } })`
- add → `setPreview({ placeId, position, source: "search" })` (opens the preview, same as the default map click)
- night-set → `setNight.mutate({ dayId, lat, lng, title })`
- night-move → `updateNight.mutate({ dayId, lat, lng })`

No backend changes.

## Error Handling

- Place `fetchFields` failure or missing `location` → build the `PlacePick` from the
  click's `lat`/`lng` with name `"Unnamed place"`, still consume, then disarm.
- `consume` with nothing armed → returns false; the map falls through to the default
  preview path.
- `disarm(id)` ignores a stale id (only the currently-armed field can disarm by id),
  so a blur/Escape from an already-replaced field can't clear a newly-armed one.
- No `MapPick` provider (defensive) → `useMapPick()` is null; fields skip arming and
  the map uses the default behavior.

## Testing

UI + Google SDK, so verification is `bun run build` + a live smoke test:
1. Focus **Change start** → the field shows a ring and the map cursor is a
   crosshair → click a place on the map → the start updates (markers/route), **no**
   preview popup opens, and the armed state clears.
2. Switch finish to **Place**, focus **Search destination**, click a map place →
   the destination is set.
3. Focus a day's **Where will you sleep?**, click a map place → that day gets a
   night there; focus **Change location** on a set night, click a map place → it
   relocates.
4. Press **Escape** while armed → the ring and crosshair clear; a subsequent map
   click opens the preview (default).
5. With nothing armed, a map place-click still opens the preview popup. No console
   errors.

## Build Phases

1. `MapPickProvider`/`useMapPick` context (arm/disarm/consume + Escape).
2. `PlaceAutocomplete` `pickId` arming (focus arm, ring, Escape/pick disarm).
3. `trip-map` armed-fill branch (Places fetch → consume) + crosshair cursor;
   `planner-shell` provider + 3 pickIds; `day-night` 2 pickIds.
4. Verification (build + live smoke).

## Out of Scope / Future

Click-empty-map-to-cancel, arming non-place fields, changing the default map-click.
No-auth/IDOR posture unchanged (deferred per the project security note).
</content>
