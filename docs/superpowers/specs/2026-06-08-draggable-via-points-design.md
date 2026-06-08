# Draggable Route Via-Points — Design

**Date:** 2026-06-08
**Status:** Approved design, ready for implementation planning
**Type:** Feature on the existing roadtripplanner (route-shaping track)

## Summary

Let the user shape the driving route onto preferred roads by adding **via-points**:
click a leg of the route to drop a control point, drag it onto the road you want,
double-click to remove it. A via bends the route's geometry **without becoming a
stop** — it doesn't appear as a POI/pin, isn't part of any day, and doesn't change
how per-day/total drive time is attributed. Implemented with the Google Routes API's
`via` (non-stopover) intermediate waypoints.

## Goals

- Add / move / delete control points that bend the route along chosen roads.
- A via is routing-only: not a stop, not in any day, no effect on drive-time
  attribution (legs stay stop-to-stop).
- Create by clicking the route line; move by dragging a diamond; delete by
  double-clicking it.

## Non-Goals (for now)

- True "grab the bare line and pull" gesture (we use click-then-drag).
- Per-day separate routes (there's one trip route: start → scheduled stops → end).
- Reassigning a via to a different leg by dragging across legs (a via stays on the
  leg it was created on; drag moves its position within/around that leg).
- A trash-zone delete UI.

## Data Model

Additive; migration is `prisma db push`.

```
RouteVia  (new)
  id         String  @id @default(cuid())
  tripId     String
  trip       Trip    @relation(fields: [tripId], references: [id], onDelete: Cascade)
  afterPoiId String?  ← the scheduled stop this via follows on the route
                        (null = the first leg, from the trip start point)
  lat        Float
  lng        Float
  seq        Int      ← order among vias that share the same leg
  createdAt  DateTime @default(now())

Trip   → add relation `routeVias RouteVia[]`
```
Notes:
- `afterPoiId` is a plain nullable string (NOT a FK to Poi) so that deleting/
  unscheduling a stop doesn't cascade-delete its vias; the route builder simply
  **skips** vias whose anchor stop isn't currently scheduled (they persist and
  reappear if the stop is rescheduled). It IS validated against the trip on create.
- `seq` orders multiple vias on the same leg (creation order).

## Route Building

The trip route is `start → scheduled stops (dayIndex, orderInDay) → end` (round
trip: end = start), unchanged from Phase 2a. Via-points are interleaved into the
Routes API request as **`via: true`** intermediates inserted immediately after their
`afterPoiId` stop (vias with `afterPoiId = null` go right after `start`), ordered by
`seq`. Because `via` waypoints are non-stopover, the Routes API does **not** create a
new leg for them — legs remain stop-to-stop, so the existing leg→day attribution and
per-day/total durations are unaffected.

**`computeRoute` extension (backward compatible):**
- Accepts waypoints as `Array<{ lat; lng; via?: boolean }>` (origin first, dest last;
  middle are stopovers unless `via: true`). Existing callers passing
  `{lat,lng}[]` (split, optimize) keep working — `via` defaults to false.
- New `opts.legPolylines` requests `routes.legs.polyline.encodedPolyline`;
  `ComputedRoute.legs[]` gains an optional `encodedPolyline`.

**Pure `itinerary-route` extension:** builds the ordered waypoint list with vias
marked `via:true` inserted after their anchor stop (skipping orphans), and produces,
for each stop-to-stop leg, the `afterPoiId` (the stop at the leg's start, or null for
the first leg) so the client can attribute a clicked leg to the right anchor.

## API

- `GET /api/trips/[tripId]/route` — now returns `legs: { encodedPolyline, afterPoiId }[]`
  (replacing the single `encodedPolyline`) plus the existing `perDaySeconds`,
  `totalSeconds`, `totalMeters`.
- `POST /api/trips/[tripId]/vias` — body `{ afterPoiId: string | null, lat, lng }` → `addVia`.
- `PATCH /api/vias/[viaId]` — body `{ lat, lng }` → `moveVia`.
- `DELETE /api/vias/[viaId]` — `removeVia`.

## Operations (dependency-injected, same pattern as existing)

```
addVia(prisma, tripId, { afterPoiId, lat, lng })   // seq = next within that leg; validates afterPoiId stop ∈ trip (if non-null)
moveVia(prisma, viaId, { lat, lng })
removeVia(prisma, viaId)
```

## Client

- `TripDetail` gains `routeVias: { id, afterPoiId, lat, lng }[]`; `getTrip` includes them.
- Hooks `useAddVia`, `useMoveVia`, `useRemoveVia` (invalidate trip + route keys).
- `components/trip-map.tsx`:
  - Render the route as **per-leg clickable polylines** (from `route.legs[].encodedPolyline`),
    visually identical to today; clicking a leg calls `onAddVia(afterPoiId, latLng)`.
  - Render each via as a **draggable diamond `AdvancedMarker`** (distinct from round POI
    pins); drag-end calls `onMoveVia(viaId, latLng)`; **double-click** calls `onRemoveVia(viaId)`.
- `components/planner-shell.tsx`: pass `route.legs`, `trip.routeVias`, and the three via
  handlers into `TripMap`.

## Interaction Summary

- **Create:** click a route leg → via at that point, anchored to the leg's start stop → re-route.
- **Move:** drag the diamond → re-route.
- **Delete:** double-click the diamond → re-route.

## Error Handling

- `addVia` validates a non-null `afterPoiId` belongs to the trip (typed
  `ItineraryError` → 400); route endpoint maps `RouteError` → 502 (unchanged).
- Orphaned vias (anchor stop unscheduled) are skipped by the route builder, not errored.
- Map: clicking empty map (not a leg) does nothing; the route falls back to the Phase-0
  straight line only if no encoded geometry is available (unchanged).

## Testing

- Operation tests (temp DB, TDD): `addVia` seq ordering + null-anchor + cross-trip
  rejection; `moveVia`; `removeVia`.
- `computeRoute` (mocked fetch): sends `via: true` for via intermediates and
  `optimizeWaypointOrder`-style fields unaffected; returns per-leg polylines when
  `opts.legPolylines`.
- `itinerary-route` (pure): inserts vias after anchor stop, skips orphans, leg
  `afterPoiId` mapping correct, leg→day attribution unchanged.
- Live smoke: click leg → diamond + bend; drag → follows; double-click → gone;
  drive-time numbers update; via never shows as a stop/day item.

## Build Phases

Single focused plan (no decomposition needed):
1. `RouteVia` schema; `addVia`/`moveVia`/`removeVia` ops (TDD).
2. `computeRoute` via-flag + leg-polylines; `itinerary-route` via insertion + leg
   afterPoiId (TDD).
3. `/route` endpoint per-leg output; via API routes; `getTrip` routeVias; types + fetchers + hooks.
4. `trip-map` per-leg clickable polylines + draggable via diamonds; `planner-shell` wiring.
5. Verification.

## Out of Scope / Future

Cross-leg via reassignment by drag, tap-tolerance for thin lines, per-day routes,
via labels/notes. The known no-auth/IDOR posture is unchanged (deferred per the
project security note).
