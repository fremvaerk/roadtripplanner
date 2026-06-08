# Set Night Locations by Address & Map Right-Click Menu — Design

**Date:** 2026-06-08
**Status:** Approved design, ready for implementation planning
**Type:** Feature on the existing roadtripplanner

## Summary

Today "Set night" drops a marker near the trip start and the user must drag it
into place. This feature lets the user place a night at a precise location three
ways: (1) an address/place search inside each day's night editor, (2) a map
right-click → "Set night ▸ Day N", and (3) the same right-click menu to add a
route waypoint (via) snapped to the nearest leg. No backend changes are needed —
`setNight`/`updateNight` already accept coordinates and `addVia` already computes
the leg sequence.

## Goals

- Place a night by searching an address/place (per day, day-scoped).
- Place a night (or relocate it) by right-clicking the map and picking a day.
- Add a route waypoint by right-clicking the map; it snaps to the nearest leg.
- Relocating a night must **preserve** its title/url/notes.

## Non-Goals (per user choices / YAGNI)

- Paste-coordinates entry.
- Pick-a-night-from-an-existing-POI.
- An "active day" selection mode (the right-click submenu chooses the day).
- A submenu/popover component library (a simple custom two-level menu suffices).

## Data Model

No changes. Reuse:
- `NightStop(dayId @unique, lat, lng, title?, url?, notes?)`.
- `RouteVia(afterPoiId, lat, lng, seq)`.

## Components

### `components/place-autocomplete.tsx` (new)

Extract the Google Places autocomplete logic currently embedded in
`place-search.tsx` (session token, request-id race guard, predictions dropdown)
into a reusable presentational component:

```
<PlaceAutocomplete
  placeholder={string}
  onPick={(p: { name: string; lat: number; lng: number; placeId: string | null }) => void}
  className?={string}
/>
```

It renders the `<Input>` + predictions `<ul>`, fetches `location/displayName/id`
on pick, calls `onPick`, then clears its own input and session token.
`PlaceSearch` (POI add) becomes a thin wrapper around it. The night editor uses
it too. This keeps the Places logic in one place (DRY).

### `components/day-night.tsx` (changed)

- **No night yet:** replace the `🛏️ Set night` button with a compact
  `<PlaceAutocomplete placeholder="🛏️ Where will you sleep? (search address)" />`.
  On pick → `useSetNight.mutate({ dayId, lat, lng, title: name })` (pre-fills the
  title with the place name; user can edit afterward).
- **Night set:** keep the existing title/url/notes editor and the map drag/clear.
  Add a small `<PlaceAutocomplete placeholder="📍 Change location…" />` row that on
  pick → `useUpdateNight.mutate({ dayId, lat, lng })` — lat/lng only, so
  title/url/notes are preserved.

### `components/trip-map.tsx` (changed)

Wrap the `<Map>` in a `position: relative` container so a DOM menu can overlay it.

- Listen for the map `contextmenu` event. Capture `latLng` (geographic) and the
  cursor pixel position (from the event's `domEvent.clientX/Y` relative to the
  container) to place the menu.
- Render a custom menu `<div>` at the cursor with:
  - **Add waypoint here** → `nearestLeg(legPaths, clicked)` → `onAddVia(afterPoiId, lat, lng)`.
    Hidden/disabled when there are no route legs.
  - **Set night ▸** → submenu of day choices (`{ id, label }[]`, label e.g.
    "Day 2 · Mon 9 Jun") → `onSetNight(dayId, lat, lng)`.
- Close the menu on outside click or Escape.
- New props: `dayChoices: { id: string; label: string }[]` and
  `onSetNight: (dayId: string, lat: number, lng: number) => void`.
- Decode each leg's polyline (already done for rendering) and pass the decoded
  paths + `afterPoiId` to `nearestLeg`.

### `lib/routing/nearest-leg.ts` (new, pure)

```
type LegPath = { afterPoiId: string | null; coords: { lat: number; lng: number }[] };
nearestLeg(legs: LegPath[], point: { lat: number; lng: number }): string | null
```

Returns the `afterPoiId` of the leg whose polyline is closest to `point`, using
minimum great-circle point-to-segment distance across all legs' segments.
Returns `null` when `legs` is empty. Pure and unit-tested.

## Data Flow (all existing endpoints)

- **Night by search, empty day** → `useSetNight` → `POST /api/days/[dayId]/night`
  (lat/lng + title) → invalidate trip + route.
- **Night relocate** (editor "change location", or right-click on a day that
  already has a night) → `useUpdateNight` → `PATCH /api/days/[dayId]/night`
  (lat/lng only).
- **Right-click set-night on a day with no night** → `useSetNight`.
  The planner's `onSetNight` handler chooses `setNight` vs `updateNight` by
  checking whether that day already has a night, so existing metadata is never
  wiped by the upsert.
- **Right-click waypoint** → `nearestLeg` → `useAddVia` → `POST /api/trips/[tripId]/vias`
  → reshapes the route.

## Interactions / Conflicts

- Left-click map behavior is unchanged (click a Google place label → add a POI).
  Night/via placement is a deliberate right-click gesture, so it does not fight
  the left-click POI-add.
- "Add waypoint here" is hidden when no route exists (no leg to anchor to).

## Error Handling

- Autocomplete reuses the existing request-id race guard and session token.
- Setting a night for a day that already has one never loses metadata (handler
  routes to `updateNight` for lat/lng-only changes).
- `nearestLeg` returns `null` for empty legs; the menu hides the waypoint action
  in that case, so `onAddVia` is never called without an anchor.

## Testing

- **Unit (TDD):** `nearestLeg` — picks the closest of several legs; single leg;
  empty legs → null; a point essentially on one leg resolves to that leg's
  `afterPoiId`.
- **Live smoke:**
  - Empty day → search a hotel → night appears there with the title pre-filled.
  - Right-click empty map → Set night ▸ Day 2 → night placed at the cursor for Day 2.
  - Right-click near the route → Add waypoint → via appears on the nearest leg and
    the route reshapes.
  - Relocate a night that has notes (editor search or right-click) → location
    moves, title/url/notes preserved.

## Build Phases

Single focused plan:
1. `nearestLeg` pure helper (TDD).
2. Extract `PlaceAutocomplete`; refactor `PlaceSearch` to use it.
3. Night editor: empty-state search + "change location" search.
4. Map right-click menu (via + set-night submenu); wire `onSetNight`/`dayChoices`
   from the planner with the setNight-vs-updateNight metadata guard.
5. Verification (unit + live smoke).

## Out of Scope / Future

Paste-coordinates, pick-from-existing-POI, active-day mode. No-auth/IDOR posture
unchanged (deferred per the project security note).
</content>
</invoke>
