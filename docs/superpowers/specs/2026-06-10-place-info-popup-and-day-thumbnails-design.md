# Place Info Popup + Day Thumbnails — Design

**Date:** 2026-06-10
**Status:** Approved design, ready for implementation planning
**Type:** UI feature (map popup + itinerary thumbnails) with a small API extension

## Summary

Two related improvements to how places are shown:

1. **Left-click a Place marker** on the map opens an info popup (photo, name,
   category, description, address) with **Edit** / **Remove** and an
   **Open in Google Maps** link. If the place has no photo/address stored yet, the
   popup **enriches it from Google on first open** (by `placeId`, else a nearby
   search at its coordinates), **persists** the photo + address (+ placeId) onto the
   place, and shows stored data on every later open. Right-click keeps the quick
   Edit/Remove menu.
2. **Thumbnails in the Days section** — each place card (`PoiCard`) shows the place's
   image thumbnail, mirroring the master-list row. Enrichment backfills `imageUrl`,
   so day cards gain thumbnails as places are opened (or when an image is set in the
   editor).

## Background

- `PlacePreview` (`components/place-preview.tsx`) is the existing popup for **un-added**
  Google basemap POIs: it `fetchFields`-es Google details by `placeId` and shows an
  "Add to Places" button. It's opened via `onPreviewPlace` and rendered in an
  `InfoWindow` in `trip-map.tsx`.
- Our **added** places render as `PoiMarker` (in `trip-map.tsx`) — `clickable`, with a
  right-click `contextmenu` listener (Edit/Remove menu via `onEditPoi`/`onRemovePoi`).
  **Left-click currently does nothing.**
- POIs store `name`, `category`, `description`, `imageUrl`, `address`, `placeId`,
  `lat`, `lng`. The **migrated** places have `description` only —
  `placeId`/`imageUrl`/`address` are `null`.
- The POI edit API (`PATCH /api/pois/[poiId]`, op `"edit"`, `patchPoiSchema`) accepts
  only `name`/`description`/`imageUrl` today.
- The master-list `CatalogRow` already renders a `poi.imageUrl` thumbnail with a
  broken-image fallback (`brokenUrl` state + `onError`); `PoiCard` does not.

## Goals

- Left-click a place → an info popup with photo/name/category/description/address +
  Edit/Remove + Open-in-Maps.
- Lazy, cached enrichment: fetch Google photo/address once, persist, reuse.
- Place cards in the Days section show the image thumbnail when present.

## Non-Goals (YAGNI)

- Re-fetching/refreshing enrichment after the first successful one (it's cached;
  the editor can change the image manually).
- Overwriting the user's curated `description` with Google's summary (kept as-is).
- A popup on start/end/night markers (only Place POIs).
- Bulk pre-enrichment of all places (enrichment is on-demand, per open).

## Architecture

### 1. API: persist enrichment — `lib/itinerary/schema.ts`, `operations.ts`, route, `lib/api/trips.ts`

Extend the `"edit"` branch of `patchPoiSchema` with two optional, nullable fields:
```ts
address: z.string().nullable().optional(),
placeId: z.string().nullable().optional(),
```
`updatePoi` (in `lib/itinerary/operations.ts`) sets `address` / `placeId` when present
(alongside the existing `name`/`description`/`imageUrl`). The `PATCH /api/pois/[poiId]`
handler already routes op `"edit"` to `updatePoi`, so no route logic changes beyond
the schema. Extend the client helper `updatePoiRequest` (`lib/api/trips.ts`) and the
`PatchPoiBody`/`useUpdatePoi` typing to carry `address`/`placeId`.

### 2. `PlaceInfoPopup` — `components/place-info-popup.tsx` (new)

Props: `{ poi: PoiDetail; tripId: string; onEdit: () => void; onRemove: () => void; onClose: () => void }`.

Render (compact card, matching `PlacePreview`'s look):
- the photo (`poi.imageUrl`) if present;
- `poi.name`, `poi.category` (if any), `poi.description`;
- `poi.address` (if present);
- an **Open in Google Maps** link (`https://www.google.com/maps/search/?api=1&query=${lat},${lng}` — or `&query_place_id=${placeId}` when known);
- **Edit** (calls `onEdit`) and **Remove** (calls `onRemove`) buttons.

**Enrichment (first open only):**
- "Needs enrichment" = `!poi.imageUrl && !poi.address`.
- On mount, if it needs enrichment and the Places library is ready:
  - if `poi.placeId`: `new placesLib.Place({ id: poi.placeId })`, then `fetchFields(["photos","formattedAddress","editorialSummary","id"])`;
  - else: a **nearby search** at `(poi.lat, poi.lng)` (`Place.searchNearby` with a small radius, rank by distance, `maxResultCount: 1`, requesting `photos`/`formattedAddress`/`id`) → the nearest place;
  - derive `photoUrl = place.photos?.[0]?.getURI({ maxWidthPx: 400 }) ?? null`, `address = place.formattedAddress ?? null`, `placeId = place.id ?? poi.placeId`;
  - persist via `useUpdatePoi(tripId)` op `"edit"` with `{ imageUrl: photoUrl ?? undefined, address, placeId }` (leaving `name`/`description` untouched) — this caches it (and populates the day thumbnail);
  - show the fetched values immediately (optimistic local state) so the first open isn't empty.
- A place with **no** Google match keeps showing its stored name/category/description
  (and may re-attempt on a later open — acceptable; rare).

### 3. Wire left-click in `trip-map.tsx`

- `TripMap` gains props `tripId: string` and `placeDetails: PoiDetail[]` (the full
  `trip.pois`, for popup lookup).
- A `selectedPoiId` state; `PoiMarker` gets an `onSelect` (left-click) that sets it.
- Render the popup when selected:
  ```tsx
  {selected && (
    <InfoWindow position={{ lat: selected.lat, lng: selected.lng }} onCloseClick={() => setSelectedPoiId(null)}>
      <PlaceInfoPopup
        poi={selected}
        tripId={tripId}
        onEdit={() => { onEditPoi?.(selected.id); setSelectedPoiId(null); }}
        onRemove={() => { onRemovePoi?.(selected.id); setSelectedPoiId(null); }}
        onClose={() => setSelectedPoiId(null)}
      />
    </InfoWindow>
  )}
  ```
  where `selected = placeDetails.find((p) => p.id === selectedPoiId)`. Edit/Remove
  reuse the **existing** `onEditPoi`/`onRemovePoi` callbacks (Edit opens the
  `PlaceEditor` in `planner-shell`; Remove uses `useRemovePoi`).
- `PoiMarker` adds an `onClick` to the `AdvancedMarker` calling `onSelect(point.id)`
  (it's already `clickable`). Right-click → context menu is unchanged.
- `planner-shell` passes `tripId={tripId}` and `placeDetails={trip.pois}` to `TripMap`.

### 4. `PoiCard` thumbnail — `components/poi-card.tsx`

Mirror `CatalogRow`: a `brokenUrl` state reset on `poi.imageUrl` change, and before the
name render the thumbnail when present:
```tsx
{poi.imageUrl && poi.imageUrl !== brokenUrl ? (
  <img src={poi.imageUrl} alt="" onError={() => setBrokenUrl(poi.imageUrl)}
       className="h-7 w-7 shrink-0 rounded object-cover" />
) : null}
```

## Data Flow

Left-click marker → `selectedPoiId` set → `PlaceInfoPopup` opens with the full POI →
if un-enriched, Google lookup → persist `imageUrl`/`address`/`placeId` via
`useUpdatePoi` → trip query invalidates → popup, map, master list, and **day
thumbnail** all reflect the cached image. Subsequent opens read the stored fields (no
fetch). Edit → `PlaceEditor`; Remove → `useRemovePoi`.

## Error Handling

- Places library not loaded yet, or a fetch/search error, or no result → the popup
  falls back to the stored name/category/description; nothing is persisted.
- Photo `getURI` failures → no image stored; description still shows.
- A broken stored `imageUrl` → the `onError` fallback hides the thumbnail/photo.
- Enrichment never overwrites `name`/`description`.

## Testing

- **Unit:** a small pure helper `googleMapsUrl(lat, lng, placeId?)` (builds the
  Open-in-Maps link) in `lib/places/` with tests.
- **Live smoke** (`bun run build` + browser): left-click a migrated place (e.g. a
  Norway stop) → popup opens, enriches with a photo + address, which persist (reopen →
  no re-fetch; the day card now shows a thumbnail); Edit opens the editor; Remove
  deletes; right-click still shows the quick menu; no console errors.

## Build Phases

1. API: extend `patchPoiSchema` edit + `updatePoi` + `updatePoiRequest`/`useUpdatePoi`
   for `address`/`placeId` (+ a service test).
2. `googleMapsUrl` helper (+ unit test).
3. `PlaceInfoPopup` (display + enrichment + persist + Edit/Remove/Maps link).
4. `trip-map` wiring (`tripId`/`placeDetails` props, `selectedPoiId`, `PoiMarker`
   `onClick`, the InfoWindow) + `planner-shell` props.
5. `PoiCard` thumbnail.
6. Verification (build, unit tests, live smoke).

## Out of Scope / Future

Refreshing/replacing enrichment, popups on non-place markers, bulk enrichment, a
shared photo-card component between `PlacePreview` and `PlaceInfoPopup`.
