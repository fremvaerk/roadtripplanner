# Place Marker Context Menu — Design

**Date:** 2026-06-10
**Status:** Approved design, ready for implementation planning
**Type:** UI feature on the trip map

## Summary

Right-clicking one of the trip's place markers (a POI pin) on the map opens a
small context menu with **✎ Edit** and **✕ Remove** for that stop. Edit reuses the
existing `PlaceEditor` modal; Remove deletes the stop immediately (same as the
sidebar list's ✕). This exposes the edit/remove actions — currently only in the
sidebar list — directly from the map.

## Background

- Place stops render as `AdvancedMarker` pins in `components/trip-map.tsx`; each
  `MapPoint` carries the POI `id`, but the markers have no click/contextmenu
  handler today.
- The map already has a **background** right-click menu (Add to Places / Add
  waypoint / Set night) driven by a `menu` state and a reusable backdrop + fixed
  popup.
- POI **edit** already exists as `PlaceEditor` (`components/place-editor.tsx`,
  props `{ poi, tripId, onClose }`); POI **remove** exists as `useRemovePoi`
  (`hooks/use-poi-mutations.ts`) → `DELETE /api/pois/[poiId]`. Both are used by the
  sidebar's `CatalogRow` today.

## Goals

- Right-click a place pin → a context menu naming the place, with Edit and Remove.
- Edit opens the existing `PlaceEditor` modal for that POI.
- Remove deletes the stop immediately (no confirm), matching the list.
- Right-clicking empty map still shows the existing background menu (unchanged); the
  two never both appear.

## Non-Goals (YAGNI)

- A menu on the start/end/night/via markers (only POI place stops).
- A confirm dialog on Remove (immediate, matching the list).
- Left-click behavior changes (left-click on our pins stays inert; the basemap-POI
  preview on left-click is unchanged).
- New backend or new edit capabilities (reuse `PlaceEditor` / `useRemovePoi`).

## Architecture

### 1. Marker right-click → `poiMenu` (`components/trip-map.tsx`)

- Add a separate state `poiMenu: { x: number; y: number; poiId: string; name: string } | null`
  (kept distinct from the existing background `menu` state for clarity).
- Wrap each POI marker's `Pin` in an element with `onContextMenu`:
  ```tsx
  <AdvancedMarker key={p.id ?? i} position={p} title={p.name}>
    <div
      onContextMenu={(e) => {
        if (!p.id) return;
        e.preventDefault();   // suppress native browser menu
        e.stopPropagation();  // don't also open the map's background menu
        setPoiMenu({ x: e.clientX, y: e.clientY, poiId: p.id, name: p.name });
      }}
    >
      <Pin … />
    </div>
  </AdvancedMarker>
  ```
- Render the POI menu using the same backdrop + fixed-popup shell as the background
  menu: a non-interactive header (`p.name`), then **✎ Edit** → `onEditPoi(poiMenu.poiId)`
  and **✕ Remove** → `onRemovePoi(poiMenu.poiId)`. Each action closes the menu
  (`setPoiMenu(null)`). The backdrop closes it on outside click / right-click.
- The existing background `menu` is only opened by the `Map`'s `onContextmenu`; the
  marker's `stopPropagation` keeps it from firing on a marker right-click, so only
  one menu shows.

### 2. Callbacks + props (`components/trip-map.tsx`)

`TripMap` gains two optional props:
```ts
onEditPoi?: (poiId: string) => void;
onRemovePoi?: (poiId: string) => void;
```
The Edit/Remove items render only when their callback is provided (consistent with
how the background menu gates its items on `onAddPlace` etc.).

### 3. Wiring (`components/planner-shell.tsx`)

- Add `useRemovePoi(tripId)` (from `hooks/use-poi-mutations.ts`); pass
  `onRemovePoi={(id) => removePoi.mutate(id)}`.
- Add `editingPoiId` state (`useState<string | null>(null)`, declared with the other
  hooks before the loading/error guards); pass `onEditPoi={(id) => setEditingPoiId(id)}`.
- After the map, render the editor when a poi is selected:
  ```tsx
  {(() => {
    const editingPoi = editingPoiId ? trip.pois.find((p) => p.id === editingPoiId) : null;
    return editingPoi ? (
      <PlaceEditor poi={editingPoi} tripId={tripId} onClose={() => setEditingPoiId(null)} />
    ) : null;
  })()}
  ```
  `PlaceEditor` is a fixed-overlay modal, so it renders correctly regardless of
  placement. If `editingPoiId` references a poi that no longer exists (e.g. removed
  elsewhere), `editingPoi` is null and nothing renders — safe.

### 4. Optional cleanup

With two near-identical menu popups now in `trip-map.tsx`, factor the shared
backdrop + fixed-positioned popup into a small presentational wrapper
(e.g. `ContextMenu({ x, y, onClose, children })`) used by both the background menu
and the POI menu. This is a contained DRY improvement, not a behavior change; skip
if it complicates the diff.

## Data Flow

Right-click pin → `poiMenu` opens → **Edit** sends the poi id to `planner-shell`,
which opens `PlaceEditor` (name / image URL / description / etc.; saves via the
existing `useUpdatePoi`) → **Remove** calls `useRemovePoi` →
`DELETE /api/pois/[poiId]` → trip + route queries invalidate → the pin disappears
and the route recomputes. No backend change.

## Error Handling

- A marker missing an `id` does not open the menu (guarded).
- Remove is fire-and-forget like the list; the mutation invalidates the trip/route
  queries on success so the UI self-corrects. A delete of an already-gone poi is a
  no-op the existing endpoint tolerates.
- Closing the menu (outside click, right-click elsewhere, or after an action) clears
  `poiMenu`.

## Testing

Pure UI over the Google Maps SDK, so `bun run build` plus a live smoke test on the
Nordkapp trip:
1. Right-click a place pin → a menu appears headed with the place name, showing Edit
   and Remove.
2. Edit → the `PlaceEditor` modal opens for that place; a change saves and persists.
3. Remove → the stop is deleted (pin gone, route/day drive-time updates).
4. Right-click on empty map still shows the original Add to Places / Add waypoint /
   Set night menu — and the POI menu does **not** appear there.
5. No console errors.

## Build Phases

1. `TripMap`: `poiMenu` state + marker `onContextMenu` + the POI menu render +
   `onEditPoi`/`onRemovePoi` props (and optional shared `ContextMenu` wrapper).
2. `planner-shell`: `useRemovePoi`, `editingPoiId` state, `PlaceEditor` render, and
   pass the two callbacks to `TripMap`.
3. Verification (build + live smoke).

## Out of Scope / Future

Menus on start/end/night markers, multi-select, a confirm on remove, left-click
actions. No-auth posture unchanged.
