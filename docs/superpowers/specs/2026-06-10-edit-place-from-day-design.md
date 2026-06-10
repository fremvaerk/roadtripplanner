# Edit a Place From a Day — Design

**Date:** 2026-06-10
**Status:** Approved design, ready for implementation planning
**Type:** Small UI addition

## Summary

Add an **✎ Edit** button to each place card inside a day's itinerary (`PoiCard`), so
a place assigned to a day can be edited in place — reusing the existing `PlaceEditor`
modal, exactly as the master-list `CatalogRow` already does.

## Background

Day-assigned places render as `PoiCard` (in `components/poi-card.tsx`) inside
`PoiContainer` within each day card. A `PoiCard` currently shows: a drag handle (⠿),
the place name, and a ✕ button that removes the place from the day
(`useMovePoi` → `dayId: null`, back to the pool — not a delete).

Editing already exists via `PlaceEditor` (`components/place-editor.tsx`, props
`{ poi: PoiDetail, tripId: string, onClose: () => void }`, a fixed-overlay modal that
saves via `useUpdatePoi`). It's opened today by:
- `CatalogRow` (master list): a ✎ button → local `editing` state → renders `PlaceEditor`.
- The map marker right-click → an `onEditPoi` callback to `planner-shell`.

`PoiCard` has no edit affordance.

## Goals

- A ✎ Edit button on each `PoiCard` that opens `PlaceEditor` for that place.
- Reuse the existing editor and `useUpdatePoi` — no new edit logic.
- Edits reflect in both the day card and the master list (same query invalidation).

## Non-Goals (YAGNI)

- A different edit trigger (e.g. click-the-name) — a ✎ button matches `CatalogRow`.
- Editing day/group assignment from here (the ✕ / drag already handle placement).
- Any change to `PlaceEditor` itself or to the remove (✕) behavior.

## Architecture

### `components/poi-card.tsx`

Mirror `CatalogRow`'s self-contained pattern:
- Import `useState` and `PlaceEditor`.
- Add local state: `const [editing, setEditing] = useState(false);`.
- Render an **✎** button between the name and the ✕, `aria-label={\`Edit ${poi.name}\`}`,
  `onClick={() => setEditing(true)}`, styled like the existing ghost controls.
- At the end of the `<li>`, render `{editing ? <PlaceEditor poi={poi} tripId={tripId} onClose={() => setEditing(false)} /> : null}`.

No callback threading: `PoiCard` keeps managing its own edit state (the same approach
`CatalogRow` uses), avoiding plumbing an `onEditPoi` through
planner-shell → CollapsibleSection → day card → PoiContainer → PoiCard.

The ✕ (remove from day) and ✎ (edit place) are distinct actions; both are
`aria-label`led.

## Data Flow

✎ → `editing = true` → `PlaceEditor` opens → user edits name/description/image →
Save → `useUpdatePoi` → `PATCH /api/pois/[poiId]` → trip query invalidates → the
place's name/thumbnail update in both the day card and the master list. No backend
or data-model change.

## Error Handling

`PlaceEditor` owns its own validation and pending/error states (unchanged). If the
place is removed elsewhere while the editor is open, the card unmounts and the modal
closes with it — same as `CatalogRow`.

## Testing

UI over the existing editor, so `bun run build` + a live smoke test:
1. Open a day with assigned places; click ✎ on a place → `PlaceEditor` opens for it.
2. Change a field (e.g. description) → Save → it persists; the day card reflects any
   visible change (e.g. name) and so does the master-list entry for the same place.
3. The ✕ still removes the place from the day; no console errors.

## Build Phases

1. Add the ✎ button + `PlaceEditor` render to `PoiCard`.
2. Verification (build + live smoke).

## Out of Scope / Future

Click-the-name editing, inline (non-modal) editing, editing assignment from the card.
No-auth posture unchanged.
