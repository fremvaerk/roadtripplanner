# Rich, Editable Places (image via URL) — Design

**Date:** 2026-06-09
**Status:** Approved design, ready for implementation planning
**Type:** Feature on the existing roadtripplanner (Feature B of two; A = group colors, done)

## Summary

Save a place's photo, address, and description when it's added (the map preview
already fetches them but throws them away), and let the user edit a saved place's
name, description, and image. Images are referenced by **URL** (no file upload).
Each saved place shows a small thumbnail in the sidebar list; editing happens in a
modal dialog.

## Goals

- On add, persist the place's `address`, `description`, and image `imageUrl`
  (from the Google place preview).
- Edit a saved place's `name`, `description`, and `imageUrl` in a modal.
- Show a small image thumbnail on each place row in the master list.

## Non-Goals (YAGNI / per user choices)

- File uploads — images are a URL only.
- Editing `address` (saved from Google on add, shown read-only).
- Showing the description on the row (it lives in the editor).
- Thumbnails on day cards (the master-list row is the canonical place list).

## Data Model (`Poi`)

- Rename the unused `photoRef String?` → `imageUrl String?`.
- Add `description String?`.
- Reuse the existing `address String?`.
Migration via `prisma db push` (dev + test) + `prisma generate` (throwaway DBs).

## Persist on Add

The map `PlacePreview` (`components/place-preview.tsx`) already fetches
`displayName`, `formattedAddress`, `editorialSummary`, and `photos[0].getURI(...)`.
Today the add discards all but name/coords/placeId/category. Thread the rest:

- `AddPoiInput` (`lib/itinerary/operations.ts`) gains `address?`, `description?`,
  `imageUrl?` (all `string | null`/optional).
- `addPoiSchema` (`lib/itinerary/schema.ts`) gains optional `address`,
  `description`, `imageUrl` (strings).
- `addPoi` op writes `address`, `description`, `imageUrl` to the new columns.
- `PlacePreview`'s `onAdd` payload includes `address: details.address`,
  `description: details.description`, `imageUrl: details.photoUrl`.
- The planner's `handleAddFromMap` forwards `address`/`description`/`imageUrl` into
  `addPoi.mutate` (it currently maps only a subset).

## Edit a Saved Place

- New op `updatePoi(prisma, poiId, patch)` where
  `patch: { name?: string; description?: string | null; imageUrl?: string | null }`.
  Builds a Prisma update with only the present fields; returns the row. (Address
  is not editable — set only on add.)
- `patchPoiSchema` (`lib/itinerary/schema.ts`) is a discriminated union on `op`
  (`move`/`group` today). Add an `edit` variant:
  ```
  z.object({
    op: z.literal("edit"),
    name: z.string().min(1).optional(),
    description: z.string().nullable().optional(),
    imageUrl: z.string().url().nullable().optional(),
  })
  ```
  (Empty image input → send `null` to clear; an invalid URL → 400.)
- The poi `PATCH` route (`app/api/pois/[poiId]/route.ts`) handles `op === "edit"`
  → `updatePoi`, inside the existing try/catch (ItineraryError→400, P2025→404).
- Client: `updatePoiRequest(poiId, patch)` fetcher + `useUpdatePoi(tripId)` hook
  (invalidates the trip query).
- `PoiDetail` (`lib/api/trips.ts`) gains `address: string | null`,
  `description: string | null`, `imageUrl: string | null`. `getTrip` returns the
  whole `Poi` row (no field `select`), so these flow once the columns + type exist.

## UI

### `components/place-editor.tsx` (new)

A modal dialog editing one place. Props: `{ poi: PoiDetail; tripId: string; onClose: () => void }`.
- A custom fixed overlay (backdrop + centered card) with outside-click and Escape
  to close — consistent with the existing `GroupColorPicker`/map-menu patterns
  (no shadcn Dialog dependency assumed).
- Fields: `name` (`Input`), `description` (`Textarea`), `imageUrl` (`Input`) with a
  **live `<img>` preview** below it that hides itself on load error
  (`onError` → local "broken" state); the saved `address` shown read-only.
- A **Save** button → `useUpdatePoi.mutate({ poiId, name, description, imageUrl })`
  then `onClose()`. Empty description/imageUrl are sent as `null`.

### `components/catalog-row.tsx` (modified)

Each row gains:
- a small **thumbnail** `<img>` (e.g. 28–32px, rounded, `object-cover`) shown only
  when `poi.imageUrl` is set (hidden on load error), and
- an **edit (✎) button** that opens the `PlaceEditor` modal for that place (local
  `open` state in the row, or a shared state — row-local is simplest).

## Error Handling

- `imageUrl` that isn't a valid URL → 400 (Zod `.url()`); empty → cleared (null).
- Broken image URL (valid string, dead link) → the `<img>` `onError` hides the
  preview/thumbnail; no layout break.
- `updatePoi` on a missing poi → P2025 → 404.
- Editing `name` to empty is rejected (min-1); the modal keeps the field required.

## Testing

- **Ops** (`tests/itinerary/...`): `addPoi` persists `address`/`description`/`imageUrl`;
  `updatePoi` updates `name`/`description`/`imageUrl` (and leaves others).
- **Schema** (`tests/itinerary/...` or a schema test): `addPoiSchema` accepts the
  new optional fields; `patchPoiSchema` `edit` variant accepts
  `{ op:"edit", name:"X" }`, `{ op:"edit", imageUrl:null }`, and a valid URL;
  rejects `{ op:"edit", imageUrl:"not a url" }` and `{ op:"edit", name:"" }`.
- **Live smoke**: add a place via the map/search preview → its address, description,
  and image are saved and a thumbnail appears on its row; click ✎ → the modal shows
  name/description/image-URL (with live preview) + read-only address; edit each →
  Save → the row name + thumbnail update; clear the image URL → thumbnail gone;
  paste an invalid URL → Save is rejected (400) / the preview hides.

## Build Phases

1. Schema columns (`imageUrl` rename, `description` add) + `addPoi` persistence +
   `addPoiSchema` fields + `AddPoiInput` (TDD on ops/schema).
2. `updatePoi` op + `patchPoiSchema` `edit` + poi `PATCH` route + `PoiDetail` fields
   + `updatePoiRequest`/`useUpdatePoi` (TDD on op/schema).
3. `PlacePreview` add-payload (address/description/imageUrl) + planner forwarding;
   `PlaceEditor` modal; `catalog-row` thumbnail + edit button.
4. Verification (unit + live smoke).

## Out of Scope / Future

File upload, editing address, description on the row, day-card thumbnails. No-auth/
IDOR posture unchanged (deferred per the project security note).
</content>
