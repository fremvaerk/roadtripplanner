# Night Stops — Design

**Date:** 2026-06-08
**Status:** Approved design, ready for implementation planning
**Type:** Feature + model change on the existing roadtripplanner (replaces the overnight flag)

## Summary

Replace today's 🌙 "mark a place as overnight" with a first-class, per-day **night
stop**: a draggable point on the map where you sleep at the end of a day, carrying
its own **title**, **URL** (Airbnb/Booking/campsite link), and **notes**. A night
stop is the day's **endpoint** in the route, so dragging it changes that day's — and
the next day's — driving time. Refresh is on drop.

## Goals

- One optional night stop per day, with title / url / notes.
- Drag the night on the map to relocate where you sleep; per-day drive times update.
- The night anchors the day boundary: route = `start → Day1 stops → night1 → Day2
  stops → night2 → … → end`; per-day drive time = "driving until you sleep."
- Cleanly replace the old `Poi.isOvernight` overnight concept.

## Non-Goals (for now)

- Auto-suggesting/auto-placing nights along the bare drive (the deferred
  auto-segmenter — separate feature).
- Live drive-time updates while dragging (on-drop only; each move = one Routes API call).
- More than one night per day; nights as POIs/stops (a night is its own entity, not a stop).
- Lodging search/autocomplete for the night (free point + manual title/url/notes).

## Data Model

```
NightStop  (new; one per day)
  id        String   @id @default(cuid())
  dayId     String   @unique
  day       Day      @relation(fields: [dayId], references: [id], onDelete: Cascade)
  lat       Float
  lng       Float
  title     String?
  url       String?
  notes     String?
  createdAt DateTime @default(now())

Day  → add relation  night NightStop?
Poi  → REMOVE field  isOvernight
```
Migration: `prisma db push` (adds `NightStop`, drops `Poi.isOvernight`). Existing
overnight flags are discarded (acceptable for a local single-user tool).

## Routing & Drive Time

Night stops are inserted into the route as **stopover** waypoints at day boundaries:
`start → [day0 stops] → night0? → [day1 stops] → night1? → … → [last day stops] → end`.
A day with no night flows straight into the next day's first stop.

`lib/routing/itinerary-route.ts` `buildRoute(trip, vias)` is extended to also take the
per-day nights and: after each day's stops, append that day's night (if set) as a
stopover, and attribute the leg arriving at the night to that day. Result:
- **Per-day drive time** = driving within that day, ending at its night.
- Dragging night `k` changes the leg into it (day k's time) and the leg out of it to
  day k+1's first stop (day k+1's time) — both refresh.
- Via-points (Phase via-points) still attach to their `afterPoiId` stop and ride along;
  legs remain stopover-to-stopover (vias are non-stopover), so attribution stays aligned.

`computeRoute` is unchanged (nights are ordinary stopovers). The `/api/trips/[tripId]/route`
endpoint passes nights into `buildRoute`; its per-leg/per-day output is unchanged in shape.

Refresh is **on drop** — a night move triggers one route recompute; the per-day 🚗
numbers re-render. (Live-while-drag would be too many API calls.)

## Operations (dependency-injected, same pattern as existing)

```
setNight(prisma, dayId, { lat, lng, title?, url?, notes? })   // upsert the day's night
updateNight(prisma, dayId, { lat?, lng?, title?, url?, notes? })
clearNight(prisma, dayId)
```
- `setNight`/`updateNight` use Prisma `upsert`/`update` on the unique `dayId`.
- Validate the day exists (typed `ItineraryError` → 400 if not).

## API

- `POST /api/days/[dayId]/night` — body `{ lat, lng, title?, url?, notes? }` → `setNight`.
- `PATCH /api/days/[dayId]/night` — body `{ lat?, lng?, title?, url?, notes? }` → `updateNight`.
- `DELETE /api/days/[dayId]/night` → `clearNight`.

## Client

- `TripDetail.days[]` gains `night: { id; lat; lng; title; url; notes } | null`; `getTrip`
  includes `night`.
- Hooks `useSetNight`, `useUpdateNight`, `useClearNight` (invalidate trip + route keys).
- `components/trip-map.tsx`: render a draggable 🛏 marker per day-night (distinct from
  round POI pins and amber via diamonds); drag-end → `updateNight(dayId, { lat, lng })`.
- `components/planner-shell.tsx`, per day:
  - if no night → a **"Set night"** button → creates a night (initial position: the day's
    last stop if any, else the trip's midpoint) you then drag; opens the edit block.
  - if a night → a compact block: editable **title** (text), **URL** (input; rendered as a
    clickable link when set), **notes** (textarea), and a **Remove night** control.
  - the 🌙 overnight toggle on POI cards is removed.

## Removed / Changed (replace cleanup)

- `Poi.isOvernight` (schema), `setOvernight` (op + `/api/pois/[poiId]` "overnight" op +
  `patchPoiSchema` member), the 🌙 toggle in `poi-card.tsx`.
- `movePoi` no longer clears `isOvernight`.
- Split engine (`split-trip.ts`): drop the "overnight stays last" placement; nights are no
  longer stops, so the pool split just distributes stops. `resplitAll` no longer clears
  `isOvernight`.
- `optimizeDay`: the day's route-end anchor becomes the day's **night point** (if set),
  else the last stop (instead of the overnight POI).

## Error Handling

- Night ops validate the day exists → `ItineraryError` → 400; not-found PATCH/DELETE → 404.
- URL stored as plain text (no validation beyond optional); rendered as a link only if
  non-empty. Dragging off-route is allowed (it's a free point).

## Testing

- Operation tests (temp DB, TDD): `setNight` upsert (one per day), `updateNight` partial,
  `clearNight`; day-not-found rejection.
- `buildRoute` (pure): inserts day nights as stopovers at boundaries; per-day attribution
  (leg into the night → that day; leg out → next day); day with no night; with via-points.
- `optimizeDay`: anchors on the night point when set.
- Live smoke: Set night on Day 1 → drag it → Day 1 and Day 2 🚗 times change; edit
  title/url/notes; URL clickable; remove night → route reverts; old 🌙 toggle gone.

## Build Phases

Single focused plan:
1. Schema: `NightStop` + `Day.night`; remove `Poi.isOvernight`. Remove `setOvernight`
   op/endpoint/`patchPoi` member + 🌙 toggle + `movePoi` clear + split overnight-last.
2. Night ops (`setNight`/`updateNight`/`clearNight`) (TDD); `optimizeDay` night anchor.
3. `buildRoute` night insertion + attribution (TDD); route endpoint passes nights.
4. Night API routes; `getTrip` night; types + fetchers + hooks.
5. Map draggable night markers; sidebar per-day night block (set/edit/remove).
6. Verification.

## Out of Scope / Future

Auto-place nights along the drive; lodging search for nights; multiple nights/day; live
drag drive-time. No-auth/IDOR posture unchanged (deferred per the project security note).
