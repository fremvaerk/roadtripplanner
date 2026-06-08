# Add/Remove Days & Trip Dates — Design

**Date:** 2026-06-08
**Status:** Approved design, ready for implementation planning
**Type:** Feature on the existing roadtripplanner

## Summary

Let the user change the number of days in a trip after creation (append a day,
remove any day) and give days real calendar dates derived from an editable trip
start date. Day headers show e.g. "Day 1 · Mon 9 Jun" when a start date is set,
otherwise just "Day N". Removing a day sends its stops back to the pool and discards
its night.

## Goals

- "＋ Add day" appends a day at the end; each day has a "✕ remove day".
- Removing a day: its POIs return to the pool (kept in the master list), its night
  is discarded, remaining days renumber.
- An editable trip **start date**; day dates are derived (consecutive) from it.
- Day headers show the derived date when a start date is set.

## Non-Goals (for now)

- Inserting a day at an arbitrary position (append-only).
- Per-day independent/non-consecutive dates (dates are always `start + dayIndex`).
- Times of day; multi-date ranges per day.

## Data Model

No new tables/columns — reuse existing:
- `Trip.startDate DateTime?` (already exists; set at intake, now editable in the planner).
- `Day.date` exists but stays **unused** (dates are derived, not stored).
- `Day` keeps `@@unique([tripId, dayIndex])`.

Day `k`'s calendar date = `startDate + k days` (k = `dayIndex`), computed for display.
If `startDate` is null, no dates are shown (headers fall back to "Day N").

## Operations (dependency-injected, same pattern as existing)

```
addDay(prisma, tripId)        // dayIndex = current day count; returns the new Day
removeDay(prisma, dayId)      // txn: set that day's POIs dayId=null, orderInDay=null;
                              //      delete the Day (its NightStop cascades);
                              //      renumber remaining days' dayIndex to 0..n-1 (ascending = collision-free)
```
- `setStartDate` is folded into the existing `updateTrip(prisma, id, patch)` (the patch gains an optional `startDate`).
- Removing a day **never deletes POIs**: `Poi.day` is `onDelete: SetNull`, so its POIs detach to the pool; `removeDay` also nulls their `orderInDay`. `NightStop.day` is `onDelete: Cascade`, so the day's night is removed.
- Renumbering decrements indices in ascending order, so each target slot is already free — no `@@unique([tripId, dayIndex])` collision.
- Allowing 0 days is fine (the pool holds everything).

## Pure helper

```
dayDate(startDateISO: string | null, dayIndex: number): Date | null
```
Returns `startDate + dayIndex` days as a UTC date (null if no start date). Computed in
UTC so "Day 1" equals the chosen date regardless of browser timezone. Formatting in
the UI uses `Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })`.

## API

- `POST /api/trips/[tripId]/days` → `addDay` (201, returns the new day).
- `DELETE /api/days/[dayId]` → `removeDay` (204).
- Extend `PATCH /api/trips/[tripId]` (existing) so its body may include `startDate`
  (an ISO date string or null); `updateTripSchema` gains `startDate`.

## Client

- `TripDetail` gains `startDate: string | null` (`getTrip` already returns it; add to the type).
- Hooks: `useAddDay`, `useRemoveDay`, `useSetStartDate` (all invalidate trip + route).
- **Trip header (`planner-shell.tsx`):** a native date `<input type="date">` bound to
  the trip's start date (empty when null) → `useSetStartDate`. Clearing it sets null.
- **Day header:** `Day {n}` plus, when a start date is set, the derived date via the
  helper (e.g. "· Mon 9 Jun"); a small **✕** remove-day control that confirms
  ("Remove this day? Its places go back to the list and its night is discarded.").
- **Below the day list:** a **"＋ Add day"** button → `useAddDay`.

## Error Handling

- `removeDay` on a non-existent day → Prisma `P2025` → 404 from the route.
- `startDate` patch accepts an ISO date string or null; invalid → 400 (Zod).
- Routing/split unaffected (they key on day membership, not dates); per-day drive
  time still works.

## Testing

- Operation tests (temp DB, TDD): `addDay` (appends at next index), `removeDay`
  (POIs → pool with dayId/orderInDay null, night gone, remaining days renumbered
  0..n-1), `updateTrip` with `startDate`.
- Pure `dayDate` helper: UTC correctness (Day 0 = start date; Day 2 = +2; null start → null).
- Live smoke: set start date → headers show dates; add a day → appears at end with the
  next date; remove a middle day → its stops return to the pool, days renumber and
  dates shift; clear the start date → headers revert to "Day N".

## Build Phases

Single focused plan:
1. `addDay`/`removeDay` operations + `updateTrip` startDate (TDD); pure `dayDate` helper (TDD).
2. API: days routes + `PATCH /api/trips/[tripId]` startDate; `updateTripSchema` startDate; `TripDetail.startDate`; fetchers + hooks.
3. UI: start-date picker, day-header dates + remove ✕, "＋ Add day".
4. Verification.

## Out of Scope / Future

Insert-at-position, per-day custom dates, times, date ranges. No-auth/IDOR posture
unchanged (deferred per the project security note).
