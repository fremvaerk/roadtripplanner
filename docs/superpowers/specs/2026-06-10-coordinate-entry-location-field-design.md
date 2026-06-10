# Coordinate Entry in the Location Field — Design

**Date:** 2026-06-10
**Status:** Approved design, ready for implementation planning
**Type:** UI feature on the shared location-search field

## Summary

Let the user type a coordinate pair — in **decimal** (`67.2335, 14.6212`) or
**degrees-minutes-seconds** (`N 59°53'52.6668" E 17°38'7.5552"`) — into any location
field and pick it as a place. The field detects the pair, offers a
"📍 Use coordinates" suggestion, and on click reverse-geocodes those exact
coordinates to a place name (falling back to `Pin <lat>, <lng>`). This covers the
"all I have is coordinates" case for night stops and every other location field.

## Background

- `components/place-autocomplete.tsx` is the shared location field (night editor,
  start/finish, "add a place"). Typing fetches Google Places text predictions;
  clicking one calls `onPick({ name, lat, lng, placeId, types })`. Typing raw
  coordinates returns nothing useful.
- `components/trip-map.tsx`'s `resolvePlace` already reverse-geocodes a clicked
  empty point: `new geocodingLib.Geocoder().geocode({ location: { lat, lng } })` →
  `results[0].formatted_address`, with a `Pin <lat>, <lng>` fallback.

## Goals

- Detect a coordinate pair typed into the location field — **decimal degrees** or
  **DMS** (degrees-minutes-seconds, with N/S/E/W hemispheres).
- Offer it as a one-row suggestion; clicking it sets that exact point with a
  reverse-geocoded name.
- Works in every field that uses `PlaceAutocomplete` (shared component).

## Non-Goals (YAGNI)

- Plus codes (`9FFW…`), UTM/MGRS, or other grid notations.
- Degrees-decimal-minutes is accepted incidentally (DMS with seconds omitted) but is
  not a separately-specified format.
- Showing both coordinate and text suggestions at once (the coordinate suggestion
  replaces text predictions while a valid pair is typed).
- A live name preview before clicking (the name is resolved on click).
- Backend changes (the night/place already store lat/lng + a name).

## Architecture

### 1. `parseCoordinates` — `lib/places/coordinates.ts` (new, pure)

```ts
export function parseCoordinates(input: string): { lat: number; lng: number } | null;
```

Tries **decimal first, then DMS**; returns `null` if neither matches. After parsing,
returns `null` unless `lat ∈ [-90, 90]` and `lng ∈ [-180, 180]`.

**Decimal** — two signed decimals separated by a comma (optionally spaced) or
whitespace:
`^\s*(-?\d+(?:\.\d+)?)\s*(?:,\s*|\s+)(-?\d+(?:\.\d+)?)\s*$` → `lat`, `lng`.
Parses: `67.2335, 14.6212`, `67.2335,14.6212`, `67.2335 14.6212`, `-33.86, 151.21`.

**DMS** (only tried when decimal fails) — find exactly two degree-components with a
global regex; each component:
```
([NSEW])?\s*(\d+(?:\.\d+)?)\s*°\s*(?:(\d+(?:\.\d+)?)\s*['’′]\s*)?(?:(\d+(?:\.\d+)?)\s*["”″]\s*)?([NSEW])?
```
(case-insensitive hemisphere; minutes delimiter is straight `'`, typographic `’`, or
prime `′`; seconds delimiter is straight `"`, typographic `”`, or double-prime `″`;
minutes and seconds are optional). For each component:
`decimal = deg + min/60 + sec/3600`, negated when the hemisphere is `S` or `W`.
Assign lat/lng by hemisphere when present (the `N`/`S` component is lat, the `E`/`W`
component is lng — so order-independent); if no hemispheres, the first component is
lat and the second is lng. Require exactly two components, else `null`.
Parses: `N 59°53'52.6668" E 17°38'7.5552"` (and the typographic-quote variant
`N 59°53’52.6668” E 17°38’7.5552”`), `59°53'52.7"N 17°38'7.6"E`,
`59°53' N, 17°38' E` (seconds omitted).

**Rejected by both:** `Oslo`, `67.2335`, `200, 14`, `1,2,3`, `Route 66`.

### 2. `reverseGeocode` — `lib/places/reverse-geocode.ts` (new, shared client helper)

```ts
export async function reverseGeocode(
  geocodingLib: google.maps.GeocodingLibrary,
  lat: number,
  lng: number,
): Promise<{ name: string; placeId: string | null }>;
```

- Runs `new geocodingLib.Geocoder().geocode({ location: { lat, lng } })`; on a
  result returns `{ name: results[0].formatted_address, placeId: results[0].place_id ?? null }`.
- On no result or error returns `{ name: \`Pin ${lat.toFixed(4)}, ${lng.toFixed(4)}\`, placeId: null }`.
- **Refactor `trip-map.tsx`'s `resolvePlace`** so its `else if (geocodingLib)` branch
  calls this helper (same behavior, deduplicated). `resolvePlace` keeps the entered
  `lat`/`lng` and uses the helper's `name`/`placeId`.

### 3. Autocomplete integration — `components/place-autocomplete.tsx`

- Add `const geocodingLib = useMapsLibrary("geocoding");`.
- Add `const [coord, setCoord] = useState<{ lat: number; lng: number } | null>(null);`.
- In `onChange(input)`: compute `const c = parseCoordinates(input);`
  - if `c` is non-null: `setCoord(c)`, `setPredictions([])`, and **return** (skip the
    Places fetch — coordinates won't yield useful predictions).
  - else: `setCoord(null)` and run the existing Places autocomplete path.
- Render a coordinate suggestion when `coord` is set (in place of the predictions
  list): a single row "📍 Use coordinates — `<lat>, <lng>`". Clicking it runs:
  ```ts
  async function pickCoordinates() {
    const { lat, lng } = coord!;
    const resolved = geocodingLib
      ? await reverseGeocode(geocodingLib, lat, lng)
      : { name: `Pin ${lat.toFixed(4)}, ${lng.toFixed(4)}`, placeId: null };
    onPick({ name: resolved.name, lat, lng, placeId: resolved.placeId, types: [] });
    if (pickId && mapPick) mapPick.disarm(pickId);
    setValue(""); setPredictions([]); setCoord(null);
  }
  ```
- The coordinate suggestion is independent of the armed (pick-on-map) state; it is
  available whenever a valid pair is typed.

## Data Flow

Type `67.2335, 14.6212` → `parseCoordinates` matches → coordinate suggestion shown →
click → `reverseGeocode` names the point (exact coords kept) → `onPick(...)` →
the consumer (e.g. the night editor) updates its local `lat`/`lng`/label → Save
persists. No backend change.

## Error Handling

- Out-of-range or malformed input simply doesn't trigger the coordinate suggestion
  (falls through to normal text search).
- `reverseGeocode` failures fall back to the `Pin <lat>, <lng>` name; the exact
  coordinates are always preserved.
- If the geocoding library hasn't loaded yet, `pickCoordinates` uses the `Pin …`
  fallback name (still sets the correct point).

## Testing

- **Unit** (`tests/places/coordinates.test.ts`):
  - Decimal: accepts comma-, comma+space-, and whitespace-separated pairs and
    negatives; rejects a single number, a place name, an extra component (`1,2,3`),
    and out-of-range values (`200, 14`, `10, 200`).
  - DMS: parses `N 59°53'52.6668" E 17°38'7.5552"` and its typographic-quote variant
    to ≈`{ lat: 59.8980, lng: 17.6354 }` (assert `toBeCloseTo` to 4 decimals);
    parses a suffix-hemisphere form (`59°53'52.7"N 17°38'7.6"E`); applies S/W negation
    (`S 33°51' E 151°12'` → negative lat); tolerates seconds omitted; rejects a DMS
    string with only one component.
- **Live smoke** (`bun run build` + browser): in the night editor's
  "Change location…", type a coordinate pair → the "📍 Use coordinates" suggestion
  appears → click it → the night location updates to a reverse-geocoded name at the
  entered point; Save persists. Confirm a normal text search still works and no
  console errors.

## Build Phases

1. `parseCoordinates` (+ unit tests).
2. `reverseGeocode` helper; refactor `trip-map.tsx` `resolvePlace` to use it.
3. `place-autocomplete.tsx`: geocoding lib, coord detection, coordinate suggestion +
   `pickCoordinates`.
4. Verification (unit tests, build, live smoke).

## Out of Scope / Future

DMS/other coordinate notations, a live reverse-geocode preview, plus-code parsing.
No-auth posture unchanged.
