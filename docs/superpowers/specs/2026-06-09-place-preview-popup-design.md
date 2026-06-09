# Place Preview Popup Before Adding — Design

**Date:** 2026-06-09
**Status:** Approved design, ready for implementation planning
**Type:** Feature on the existing roadtripplanner

## Summary

Stop adding places automatically. When the user clicks a place on the map or
picks a search result, open a preview popup (a Google Maps `InfoWindow` rendered
via `@vis.gl/react-google-maps`) showing a photo, name, address, description, a
"View on Google Maps" link, and an **Add to Places** button. The place is added
only when that button is clicked. If the place is already in the trip, the button
shows **Added ✓** (disabled). Picking a search result pans/zooms the map to the
place and opens its popup there.

## Goals

- Map place click → preview popup (no auto-add).
- Search pick → map pans/zooms to the place + preview popup (no auto-add).
- Popup shows photo (if any), name, formatted address, description (if any), a
  Google Maps link, and an Add/Added button.
- "Add to Places" commits via the existing add path; closing discards.

## Non-Goals (YAGNI / per user choices)

- Rating, review count, website link (not selected).
- Reverse-geocoding bare (non-POI) map clicks.
- Previewing already-placed trip markers.
- Backend changes (the add endpoint is unchanged; the preview only reads extra
  Places fields client-side).

## Architecture

**Preview state** is lifted to `planner-shell`:

```ts
const [preview, setPreview] = useState<
  { placeId: string; position: { lat: number; lng: number }; source: "map" | "search" } | null
>(null);
```

- **Map place click** (`trip-map` `onClick`): currently auto-adds; instead calls a
  new `onPreviewPlace(placeId, position, "map")` → `setPreview`. (Clicks without a
  `placeId` stay ignored, as today.)
- **Search pick** (sidebar): the master search becomes a `PlaceAutocomplete`
  whose `onPick` calls `setPreview({ placeId, position, source: "search" })` (skip
  if `placeId` is null). The map pans/zooms via the preview effect below.
- **`InfoWindow`** opens at `preview.position`, rendering `PlacePreview`. Its
  `onCloseClick` → `setPreview(null)`.

## Components

### `components/place-preview.tsx` (new)

```ts
PlacePreview({
  placeId: string;
  source: "map" | "search";
  alreadyAdded: boolean;
  onAdd: (input: AddPoiInput) => void;
}): JSX.Element
```

- On mount / `placeId` change, fetch a fresh `google.maps.places.Place({ id })`
  with `fetchFields({ fields: ["displayName", "formattedAddress", "editorialSummary", "photos", "location", "types", "googleMapsURI", "id"] })`. Uses `useMapsLibrary("places")` (available inside the map's `APIProvider`). A request-id guard drops stale fetches when `placeId` changes quickly.
- Renders, in a ~280px card:
  - **Photo** — `place.photos?.[0]?.getURI({ maxWidth: 320, maxHeight: 180 })` as an `<img>` (omitted if no photos).
  - **Name** — `displayName`.
  - **Address** — `formattedAddress` (omitted if missing).
  - **Description** — `editorialSummary` (omitted if missing).
  - **Google Maps link** — `googleMapsURI` (fallback `https://www.google.com/maps/place/?q=place_id:${placeId}`), `target="_blank" rel="noreferrer"`.
  - **Button** — `alreadyAdded ? "Added ✓" (disabled) : "Add to Places"`. On click:
    `onAdd({ name: displayName ?? "Unnamed place", lat, lng, placeId, category: categoryFromTypes(types ?? []), source })`.
- States: a brief "Loading…" while fetching; on `fetchFields` error, render the
  name only with the Add button still enabled (using whatever fields resolved).

### `components/trip-map.tsx` (changed)

- `onClick`: replace the auto-add body with `onPreviewPlace?.(placeId, { lat, lng }, "map")` (still `ev.stop()`; still requires `placeId` and `placesLib`). The click already has `ev.detail.latLng` for the position; fall back to the fetched location is unnecessary — use `ev.detail.latLng`.
- New props: `preview` (the state above or null), `onPreviewPlace`, `addedPlaceIds: Set<string>`. The existing `onAddPlace?: (input: AddPoiInput) => void` stays and is now invoked by the popup's Add button.
- Render, when `preview` is set, `<InfoWindow position={preview.position} onCloseClick={() => onPreviewClose?.()}>` containing `<PlacePreview placeId={preview.placeId} source={preview.source} alreadyAdded={addedPlaceIds.has(preview.placeId)} onAdd={onAddPlace!} />`. (Add an `onPreviewClose` prop, or reuse `onPreviewPlace` semantics — use a dedicated `onPreviewClose`.)
- **Pan/zoom effect** (uses `useMap`): when `preview` changes to non-null,
  `map.panTo(preview.position)` and `if ((map.getZoom() ?? 0) < 13) map.setZoom(13)`. Harmless for map clicks (already near; zoom unchanged when already ≥ 13).

### `components/planner-shell.tsx` (changed)

- Add `preview` state and handlers: `onPreviewPlace` → `setPreview({...})`;
  `onPreviewClose` → `setPreview(null)`.
- Replace `<PlaceSearch tripId={tripId} />` with
  `<PlaceAutocomplete placeholder="Search a place to add…" ariaLabel="Search a place to add" onPick={(p) => p.placeId && setPreview({ placeId: p.placeId, position: { lat: p.lat, lng: p.lng }, source: "search" })} />`.
- Compute `const addedPlaceIds = new Set(trip.pois.map((p) => p.placeId).filter((x): x is string => !!x));` and pass to `TripMap`.
- Pass `preview`, `onPreviewPlace`, `onPreviewClose`, `addedPlaceIds` to `TripMap`.
- The existing `handleAddFromMap(input)` is the `onAddPlace`/`onAdd` target; change its hardcoded `source: "map"` to `source: input.source ?? "map"` so search-sourced adds are tagged correctly. On add, also clear the preview (`setPreview(null)`) — wrap so the Add button both adds and closes.

### `components/place-search.tsx` (deleted)

Now unused (its autocomplete logic already lives in `PlaceAutocomplete`). Remove
the file and its import.

## Data Flow

No backend changes. Add still calls `useAddPoi` →
`POST /api/trips/[tripId]/pois` with `{ name, lat, lng, placeId, category, source }`.
The preview reads `photos`/`formattedAddress`/`editorialSummary`/`googleMapsURI`
client-side only.

## Error Handling

- Search result without `placeId` → no preview (skip).
- Non-POI map click (no `placeId`) → ignored.
- Missing photo/description/address → those rows are not rendered.
- `fetchFields` throws → minimal card (name + enabled Add), no crash; a stale
  fetch (placeId changed mid-flight) is discarded via the request-id guard.
- Selecting a new place replaces the open preview.

## Testing

UI + Google SDK, so verification is `bun run build` plus a live smoke test:
1. Click a place on the map → popup with photo/address/description appears; the
   place is **not** added; the master list count is unchanged.
2. Click **Add to Places** → the place appears in Places; popup closes.
3. Search a place → the map pans/zooms to it and the popup opens.
4. Re-open a place that is already added → button reads **Added ✓** (disabled).
5. The "View on Google Maps" link opens the place in a new tab.
6. Close (✕) discards without adding. No console errors.

## Build Phases

1. `PlacePreview` component (fetch fields, render card, Add/Added, loading/missing states).
2. `trip-map` wiring: `onClick` → preview, `InfoWindow` + `PlacePreview`, pan/zoom effect, new props.
3. `planner-shell` wiring: preview state, `PlaceAutocomplete` master search, `addedPlaceIds`, add-and-close, source pass-through; delete `place-search.tsx`.
4. Verification (build + live smoke).

## Out of Scope / Future

Rating/website, reverse-geocoding bare clicks, previewing existing markers. The
no-auth/IDOR posture is unchanged (deferred per the project security note).
</content>
