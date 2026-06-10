# Coordinate Entry in the Location Field Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user type a decimal or DMS coordinate pair into any location field and pick it as a place (reverse-geocoded to a name).

**Architecture:** A pure `parseCoordinates` (decimal + DMS) detects a typed coordinate pair; a shared `reverseGeocode` helper names the point (also deduplicating `trip-map.tsx`'s inline logic). `PlaceAutocomplete` shows a "📍 Use coordinates" suggestion when a pair is detected and picks it on click.

**Tech Stack:** Next.js 16, React 19, TypeScript, `@vis.gl/react-google-maps` (Google Geocoder), Bun. `parseCoordinates` is unit-tested; the rest is `bun run build` + live smoke.

---

## Reference

- `components/place-autocomplete.tsx` is the shared location field. `onChange(input)` fetches Google Places predictions; `pick()` calls `onPick({ name, lat, lng, placeId, types })`. It renders a predictions `<ul>` and (when armed) a hint line.
- `components/trip-map.tsx` has `resolvePlace(placeId, lat, lng)` whose `else if (geocodingLib)` branch reverse-geocodes a point. `trip-map` already does `const geocodingLib = useMapsLibrary("geocoding");`.
- Pure-function tests live in `tests/places/` (see `tests/places/category.test.ts`).

---

## File Structure

| File | Responsibility | Action |
|------|----------------|--------|
| `lib/places/coordinates.ts` | `parseCoordinates` (decimal + DMS) | Create |
| `tests/places/coordinates.test.ts` | parser unit tests | Create |
| `lib/places/reverse-geocode.ts` | shared `reverseGeocode` helper | Create |
| `components/trip-map.tsx` | use `reverseGeocode` in `resolvePlace` | Modify |
| `components/place-autocomplete.tsx` | coord detection + suggestion + pick | Modify |

---

## Task 1: `parseCoordinates`

**Files:**
- Create: `lib/places/coordinates.ts`
- Test: `tests/places/coordinates.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/places/coordinates.test.ts`:

```ts
import { test, expect, describe } from "bun:test";
import { parseCoordinates } from "@/lib/places/coordinates";

describe("parseCoordinates — decimal", () => {
  test("comma, comma+space, and whitespace separators", () => {
    expect(parseCoordinates("67.2335,14.6212")).toEqual({ lat: 67.2335, lng: 14.6212 });
    expect(parseCoordinates("67.2335, 14.6212")).toEqual({ lat: 67.2335, lng: 14.6212 });
    expect(parseCoordinates("67.2335 14.6212")).toEqual({ lat: 67.2335, lng: 14.6212 });
  });

  test("negatives and surrounding whitespace", () => {
    expect(parseCoordinates("  -33.86, 151.21 ")).toEqual({ lat: -33.86, lng: 151.21 });
  });

  test("rejects non-coordinates and out-of-range", () => {
    expect(parseCoordinates("Oslo")).toBeNull();
    expect(parseCoordinates("67.2335")).toBeNull();
    expect(parseCoordinates("1,2,3")).toBeNull();
    expect(parseCoordinates("Route 66")).toBeNull();
    expect(parseCoordinates("200, 14")).toBeNull();
    expect(parseCoordinates("10, 200")).toBeNull();
  });
});

describe("parseCoordinates — DMS", () => {
  test("straight-quote DMS with prefix hemispheres", () => {
    const r = parseCoordinates(`N 59°53'52.6668" E 17°38'7.5552"`);
    expect(r).not.toBeNull();
    expect(r!.lat).toBeCloseTo(59.898, 3);
    expect(r!.lng).toBeCloseTo(17.6354, 3);
  });

  test("typographic-quote DMS (as Google Maps shows it)", () => {
    const r = parseCoordinates(`N 59°53’52.6668” E 17°38’7.5552”`);
    expect(r).not.toBeNull();
    expect(r!.lat).toBeCloseTo(59.898, 3);
    expect(r!.lng).toBeCloseTo(17.6354, 3);
  });

  test("suffix hemispheres", () => {
    const r = parseCoordinates(`59°53'52.7"N 17°38'7.6"E`);
    expect(r!.lat).toBeCloseTo(59.898, 3);
    expect(r!.lng).toBeCloseTo(17.6354, 3);
  });

  test("S/W negate; seconds may be omitted", () => {
    const r = parseCoordinates(`S 33°51' E 151°12'`);
    expect(r!.lat).toBeCloseTo(-33.85, 2);
    expect(r!.lng).toBeCloseTo(151.2, 2);
  });

  test("hemispheres make order not matter (lng given first)", () => {
    const r = parseCoordinates(`E 17°38'7.5552" N 59°53'52.6668"`);
    expect(r!.lat).toBeCloseTo(59.898, 3);
    expect(r!.lng).toBeCloseTo(17.6354, 3);
  });

  test("rejects a single DMS component", () => {
    expect(parseCoordinates(`N 59°53'52.6668"`)).toBeNull();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `bun run test 2>&1 | tail -8`
Expected: FAIL — `parseCoordinates` not found.

- [ ] **Step 3: Implement**

Create `lib/places/coordinates.ts`:

```ts
export type LatLng = { lat: number; lng: number };

const DECIMAL = /^(-?\d+(?:\.\d+)?)\s*(?:,\s*|\s+)(-?\d+(?:\.\d+)?)$/;
// A DMS degree-block (unsigned magnitude): degrees (required, with °), then optional
// minutes (straight/typographic/prime quote) and seconds (straight/typographic/double-prime).
const DMS_BLOCK =
  /(\d+(?:\.\d+)?)\s*°\s*(?:(\d+(?:\.\d+)?)\s*['’′]\s*)?(?:(\d+(?:\.\d+)?)\s*["”″])?/g;

function parseDecimal(input: string): LatLng | null {
  const m = input.trim().match(DECIMAL);
  if (!m) return null;
  return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };
}

function parseDms(input: string): LatLng | null {
  // Extract the two unsigned degree-block magnitudes, in order.
  const values: number[] = [];
  for (const m of input.matchAll(DMS_BLOCK)) {
    const deg = parseFloat(m[1]);
    const min = m[2] ? parseFloat(m[2]) : 0;
    const sec = m[3] ? parseFloat(m[3]) : 0;
    values.push(deg + min / 60 + sec / 3600);
  }
  if (values.length !== 2) return null;

  // Extract hemisphere letters separately, in order, and pair them with the blocks
  // by position (avoids a single regex greedily stealing the next block's hemisphere).
  const hemis = input.toUpperCase().match(/[NSEW]/g) ?? [];
  if (hemis.length === 0) return { lat: values[0], lng: values[1] };
  if (hemis.length !== 2) return null;

  const signed = values.map((v, i) => (hemis[i] === "S" || hemis[i] === "W" ? -v : v));
  const latIdx = hemis.findIndex((h) => h === "N" || h === "S");
  const lngIdx = hemis.findIndex((h) => h === "E" || h === "W");
  if (latIdx === -1 || lngIdx === -1) return null;
  return { lat: signed[latIdx], lng: signed[lngIdx] };
}

/** Parse a typed coordinate pair — decimal (`67.23, 14.62`) or DMS
 *  (`N 59°53'52.6668" E 17°38'7.5552"`). Returns null if it isn't a valid pair. */
export function parseCoordinates(input: string): LatLng | null {
  const coords = parseDecimal(input) ?? parseDms(input);
  if (!coords) return null;
  const { lat, lng } = coords;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `bun run test 2>&1 | tail -8`
Expected: PASS (the suite grows by the new coordinate tests).

- [ ] **Step 5: Commit**

```bash
git add lib/places/coordinates.ts tests/places/coordinates.test.ts
git commit -m "feat(places): parseCoordinates (decimal + DMS)"
```

---

## Task 2: shared `reverseGeocode` helper + refactor `resolvePlace`

**Files:**
- Create: `lib/places/reverse-geocode.ts`
- Modify: `components/trip-map.tsx` (`resolvePlace`)

- [ ] **Step 1: Create the helper**

Create `lib/places/reverse-geocode.ts`:

```ts
/** Reverse-geocode a point to a place name + id, with a `Pin <lat>, <lng>` fallback
 *  on no result or error. The caller keeps the exact lat/lng it passed in. */
export async function reverseGeocode(
  geocodingLib: google.maps.GeocodingLibrary,
  lat: number,
  lng: number,
): Promise<{ name: string; placeId: string | null }> {
  const fallback = { name: `Pin ${lat.toFixed(4)}, ${lng.toFixed(4)}`, placeId: null };
  try {
    const geocoder = new geocodingLib.Geocoder();
    const { results } = await geocoder.geocode({ location: { lat, lng } });
    if (results[0]) {
      return { name: results[0].formatted_address, placeId: results[0].place_id ?? null };
    }
  } catch {
    // fall through to fallback
  }
  return fallback;
}
```

- [ ] **Step 2: Use it in `trip-map.tsx`**

Add the import near the other `@/lib/...` imports in `components/trip-map.tsx`:
```ts
import { reverseGeocode } from "@/lib/places/reverse-geocode";
```
In `resolvePlace`, replace the `else if (geocodingLib) { … }` branch:
```ts
    } else if (geocodingLib) {
      try {
        const geocoder = new geocodingLib.Geocoder();
        const { results } = await geocoder.geocode({ location: { lat, lng } });
        if (results[0]) {
          pick = { name: results[0].formatted_address, lat, lng, placeId: results[0].place_id ?? null, types: [] };
        }
      } catch {
        // keep the coordinate fallback
      }
    }
```
with:
```ts
    } else if (geocodingLib) {
      const r = await reverseGeocode(geocodingLib, lat, lng);
      pick = { name: r.name, lat, lng, placeId: r.placeId, types: [] };
    }
```
(Behavior is identical: on no result/error, `reverseGeocode` returns the same `Pin <lat>, <lng>` name with a null placeId.)

- [ ] **Step 3: Build + tests**

Run: `bun run build 2>&1 | tail -5` → "✓ Compiled successfully".
Run: `bun run test 2>&1 | tail -5` → all pass.

- [ ] **Step 4: Commit**

```bash
git add lib/places/reverse-geocode.ts components/trip-map.tsx
git commit -m "refactor(places): shared reverseGeocode helper; use it in resolvePlace"
```

---

## Task 3: coordinate suggestion in `place-autocomplete.tsx`

**Files:**
- Modify: `components/place-autocomplete.tsx`

- [ ] **Step 1: Imports + geocoding lib + state**

Add imports (top of file):
```ts
import { parseCoordinates } from "@/lib/places/coordinates";
import { reverseGeocode } from "@/lib/places/reverse-geocode";
```
After `const placesLib = useMapsLibrary("places");` add:
```ts
  const geocodingLib = useMapsLibrary("geocoding");
```
With the other `useState`s (e.g. after the `predictions` state), add:
```ts
  const [coord, setCoord] = useState<{ lat: number; lng: number } | null>(null);
```

- [ ] **Step 2: Detect coordinates in `onChange`**

Replace the start of `onChange`:
```ts
  async function onChange(input: string) {
    setValue(input);
    if (!placesLib || input.trim().length < 2) {
      setPredictions([]);
      return;
    }
```
with:
```ts
  async function onChange(input: string) {
    setValue(input);
    const c = parseCoordinates(input);
    if (c) {
      setCoord(c);
      setPredictions([]);
      return;
    }
    setCoord(null);
    if (!placesLib || input.trim().length < 2) {
      setPredictions([]);
      return;
    }
```
(The rest of `onChange` — the session token + `fetchAutocompleteSuggestions` — is unchanged.)

- [ ] **Step 3: Add `pickCoordinates` and clear `coord` in `pick`**

Add this function next to `pick`:
```ts
  async function pickCoordinates() {
    if (!coord) return;
    const { lat, lng } = coord;
    const resolved = geocodingLib
      ? await reverseGeocode(geocodingLib, lat, lng)
      : { name: `Pin ${lat.toFixed(4)}, ${lng.toFixed(4)}`, placeId: null };
    onPick({ name: resolved.name, lat, lng, placeId: resolved.placeId, types: [] });
    if (pickId && mapPick) mapPick.disarm(pickId);
    setValue("");
    setPredictions([]);
    setCoord(null);
  }
```
In the existing `pick(prediction)` function, add `setCoord(null);` alongside its other resets (e.g. right after `setPredictions([]);`).

- [ ] **Step 4: Render the coordinate suggestion + guard the armed hint**

Change the armed-hint line so it hides while a coordinate is detected:
```tsx
      {armed && predictions.length === 0 && (
        <p className="mt-1 text-xs text-blue-600">Click the map to set this location · Esc to cancel.</p>
      )}
```
to:
```tsx
      {armed && !coord && predictions.length === 0 && (
        <p className="mt-1 text-xs text-blue-600">Click the map to set this location · Esc to cancel.</p>
      )}
```
Immediately **before** the predictions `{predictions.length > 0 && ( … )}` block, add the coordinate suggestion:
```tsx
      {coord && (
        <ul className="absolute z-10 mt-1 w-full overflow-auto rounded-md border bg-background shadow">
          <li>
            <button
              type="button"
              className="block w-full px-3 py-2 text-left text-sm hover:bg-accent"
              onClick={pickCoordinates}
            >
              <span className="font-medium">📍 Use coordinates</span>
              <span className="block text-xs text-muted-foreground">
                {coord.lat.toFixed(5)}, {coord.lng.toFixed(5)}
              </span>
            </button>
          </li>
        </ul>
      )}
```
(When `coord` is set, `predictions` is always `[]`, so the two lists never show at once.)

- [ ] **Step 5: Build**

Run: `bun run build 2>&1 | tail -5` → "✓ Compiled successfully".
Run: `bun run test 2>&1 | tail -5` → all pass.

- [ ] **Step 6: Commit**

```bash
git add components/place-autocomplete.tsx
git commit -m "feat(places): coordinate-pair suggestion in the location field"
```

---

## Task 4: Verification

**Files:** none.

- [ ] **Step 1: Tests + build**

Run: `bun run test 2>&1 | tail -6` → all pass.
Run: `bun run build 2>&1 | tail -5` → "✓ Compiled successfully".

- [ ] **Step 2: Live smoke (the Nordkapp trip)**

Restart the dev server if needed, open the Nordkapp trip:
1. Open a day's night editor (✎ on the night chip). In **"Change location…"**, type a decimal pair (e.g. `59.8980, 17.6354`) → a **"📍 Use coordinates"** suggestion appears → click it → the location row updates to a reverse-geocoded name; **Save** persists.
2. Repeat with a **DMS** string (`N 59°53'52.6668" E 17°38'7.5552"`) → the suggestion appears and resolves to the same point.
3. A normal **text** search (e.g. `Uppsala`) still shows place predictions; the coordinate suggestion does not appear for it.
4. The 📍 pick-on-map button still works; no console errors.

- [ ] **Step 3: Final review + finish**

Dispatch a final review over `git diff main...HEAD` against the spec. Apply high-confidence fixes, then use `superpowers:finishing-a-development-branch` to merge to `main` (`--no-ff`, delete branch).

---

## Notes for the implementer

- `parseCoordinates` tries decimal first; only strings with a `°` reach the DMS path, so prose never matches.
- The coordinate suggestion **replaces** text predictions (they're mutually exclusive because `coord` being set clears `predictions`).
- `reverseGeocode` always returns a usable name (the `Pin <lat>, <lng>` fallback), and the picked point uses the user's exact entered coordinates — the geocoder only supplies the name/placeId.
