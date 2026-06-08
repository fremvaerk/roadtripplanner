# Start-Only Creation with an Editable Finish — Design

**Date:** 2026-06-08
**Status:** Approved design, ready for implementation planning
**Type:** Feature/refactor on the existing roadtripplanner

## Summary

Stop forcing a finish location at trip creation. Creation requires only a
**start** (plus a title and an optional description). The **finish** becomes an
editable property in the planner with three modes — Open, Round trip, or a
Specific place — and the start also becomes editable in the planner. New trips
default to **Open** (the drive ends at the last stop, no terminator leg) with one
day. No schema migration: the three finish modes are encoded with the existing
`isRoundTrip` + `end*` fields.

## Goals

- Create a trip with only Title + Start (+ optional Description); 1 day; Open finish.
- Edit the finish in the planner: Open / Round trip / Specific place.
- Edit the start in the planner (address search).
- Route engine understands Open mode (route ends at the last stop, no loop).

## Non-Goals (YAGNI)

- Autocomplete on the creation page (start stays server-geocoded from free text).
- Multi-destination / per-leg finishes; choosing day count at creation.
- Any data migration for old trips (they are throwaway; backward-compatible anyway).

## Data Model

No changes. The finish modes map onto existing fields:

| Mode | `isRoundTrip` | `end*` (`endName/endLat/endLng/endPlaceId`) |
|------|---------------|----------------------------------------------|
| Open (default) | `false` | `null` |
| Round trip | `true` | `null` |
| Specific place | `false` | set |

## Route Engine (the one behavioral change)

Today both `orderedRoutePoints` and `buildRoute` (in `lib/routing/itinerary-route.ts`)
compute `end = endLat != null ? end : start`, so a missing end silently loops back
to start. New rule — compute an optional terminator:

```
terminator =
  (endLat != null && endLng != null) ? { lat: endLat, lng: endLng }   // specific place
  : isRoundTrip ? { lat: startLat, lng: startLng }                      // round trip
  : null;                                                               // open
```

- Append the terminator stopover/coord only when it is non-null.
- **Open:** route = start → assigned stops; the last leg arrives at the last stop
  (which has a `dayId`) and is day-attributed correctly. With no stops, the route
  has a single point and no legs (empty route — the route API already returns the
  empty shape when `waypoints.length < 2`).
- **Round trip:** terminator = start; the return leg arrives at a day-less
  stopover and is handled by the existing trailing-leg attribution
  (post-night → next day; otherwise last content day).
- **Specific place:** unchanged from today's one-way behavior.

Both functions get the same terminator logic. The split engine and per-day
duration/distance attribution are unaffected (they key on legs/day membership).

## Creation (simplified)

- **Form (`components/trip-form.tsx`):** Title (required), Start (required, free
  text), Description (optional `<Textarea>`). Remove the end input, the round-trip
  checkbox, and the day-count input. Submit posts `{ title, startName, description? }`.
- **`createTripSchema` (`lib/trips/schema.ts`):** drop `endName`, `isRoundTrip`,
  and the "end required unless round trip" `.refine`; make `description` optional;
  keep `dayCount` with default 1 (form no longer sends it).
- **`createTrip` service (`lib/trips/service.ts`):** always `isRoundTrip: false`,
  all `end*: null`, one day. `CreateTripData` drops `end` and `isRoundTrip`.
- **Create API route (`app/api/trips/route.ts`):** geocode only the start; no end
  geocoding; build `CreateTripData` without end/round-trip.

## Planner Edits

Reuse `PlaceAutocomplete` and extend `updateTrip` + `PATCH /api/trips/[tripId]`.

### `updateTrip` patch (`lib/trips/service.ts`) gains two optional inputs

- `start?: { name: string; lat: number; lng: number; placeId: string | null }`
  → sets `startName/startLat/startLng/startPlaceId`.
- `finish?: { mode: "open" | "round" | "place"; place?: { name; lat; lng; placeId } }`
  → service maps:
  - `"open"` → `isRoundTrip:false`, `endName/Lat/Lng/PlaceId: null`
  - `"round"` → `isRoundTrip:true`, `end*: null`
  - `"place"` → `isRoundTrip:false`, `end*` = `place` (required for this mode)

### `updateTripSchema` (`lib/trips/schema.ts`)

Add `start` and `finish` Zod objects (numbers for lat/lng, nullable placeId,
`mode` enum; `finish.place` required iff `mode === "place"` via `.refine`). The
PATCH route translates `start`/`finish` into the service patch within the existing
try/catch (isNotFound → 404).

### UI (trip header in `components/planner-shell.tsx`)

- **Start:** show the start name with an inline `PlaceAutocomplete` ("Change start…")
  → `updateTrip({ start })` via a new mutation hook.
- **Finish:** **segmented buttons** `[ Open | Round trip | Place ]`. Selecting a
  mode calls `updateTrip({ finish: { mode } })`; selecting **Place** reveals a
  `PlaceAutocomplete` (showing the current end name when set) →
  `updateTrip({ finish: { mode: "place", place } })`.
- **Summary line:** `‹start› → (open)` / `‹start› ↺ round trip` / `‹start› → ‹end›`.
- A `useUpdateTripBase` (or similar) hook wraps the PATCH and invalidates trip + route.

### Client types/fetchers (`lib/api/trips.ts`)

`TripDetail` already exposes `startName/startLat/startLng`, `endName/endLat/endLng`,
`isRoundTrip`. Add a `setTripBaseRequest` (or extend the existing trip-patch
fetcher) carrying `start`/`finish`.

## Map (`components/trip-map.tsx` + planner wiring)

- Start marker (green) always.
- **End marker (red) only in Specific-place mode** (`end` prop non-null). Round
  trip and Open pass `end={null}`; the round-trip return is drawn by the route
  polylines. `FitBounds` and the `end` prop already accept `null`.
- Planner computes the `end` MapPoint as the trip's `end*` only when set.

## Error Handling

- `createTripSchema` rejects missing title/start (400). Start geocode failure →
  existing `GeocodeError` handling.
- `finish.mode === "place"` without `place` → 400 (Zod refine).
- `updateTrip` on a missing trip → 404 (existing isNotFound path).
- Open trip with zero assigned stops → empty route (no legs), no crash.

## Testing

- **Route engine (unit, `tests/routing/itinerary-route.test.ts`):**
  open (no terminator; last leg → last stop's day), round trip (terminator =
  start), specific place (terminator = end), open with no stops (start only → no
  legs).
- **`updateTrip` (service test):** `start` sets the four start fields; each finish
  mode sets the right `isRoundTrip`/`end*` (place sets end; open/round clear end).
- **Schema (`tests/trips/schema.test.ts`):** `createTripSchema` accepts
  `{title, startName}` (no end), description optional; `updateTripSchema` accepts
  each `finish` mode and rejects `mode:"place"` without `place`.
- **Live smoke:** create with only Title+Start → planner shows Open, route ends at
  last stop; switch Round trip → route loops to start; switch Place + search →
  ends there with a red marker; edit start → markers/route update.

## Build Phases

1. Route engine: optional-terminator logic + unit tests (TDD).
2. Creation: schema/service/API/form simplification (start-only, Open, 1 day).
3. `updateTrip` start/finish patch + schema + PATCH route + service tests (TDD).
4. Client fetcher/hook + planner header UI (editable start, segmented finish,
   summary line) + map end-marker gating.
5. Verification (unit + live smoke).

## Out of Scope / Future

Creation-page autocomplete, multi-destination, day-count at creation. No-auth/IDOR
posture unchanged (deferred per the project security note).
</content>
