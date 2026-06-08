# POI Catalog & Groups — Design

**Date:** 2026-06-08
**Status:** Approved design, ready for implementation planning
**Type:** Architecture change to the existing roadtripplanner

## Summary

Today a POI lives in exactly one place: the unassigned pool *or* one day. Assigning
it to a day removes it from the pool. This change makes the POI list a **persistent
master catalog**: every POI always lives in the list (organized into user-named
**groups**), and **day assignment becomes an attribute** (`dayId`) rather than the
POI's location. A POI scheduled on a day appears in **both** the master list and
that day's column — the same record, two views. Groups (e.g. "Wineries",
"Must-see") are a manual organizing layer, orthogonal to day scheduling.

## Goals

- POIs persist in a master list and stay visible after being assigned to a day.
- Organize POIs into user-named groups (one optional group per POI).
- Assign a POI to at most one day; unassigning keeps it in the list.
- Clear distinction: **remove from day** (unschedule) vs **delete** (remove entirely).
- Reuse the existing routing/day-split engine unchanged.

## Non-Goals (for now)

- A POI on multiple days (one day at a time only).
- A POI in multiple groups (one optional group only).
- Per-group colors / map-pin tinting.
- The split engine grouping thematically (it stays geography + drive-cap only).

## Data Model

Additive only — no existing column is dropped; migration is `prisma db push`.

```
Poi  (existing; reinterpreted + 2 new fields)
  … id, tripId, name, lat, lng, placeId, category, isOvernight, source, status …
  dayId        String?   ← "scheduled on this day" (null = unscheduled). UNCHANGED column,
                           new meaning: no longer "removed from the catalog".
  orderInDay   Int?      ← position within the day (unchanged)
  groupId      String?   ← NEW: user group it's filed under (null = Ungrouped)
  orderInGroup Int?      ← NEW: position within its group in the master list

PoiGroup  (new)
  id           String  @id @default(cuid())
  tripId       String
  trip         Trip    @relation(fields: [tripId], references: [id], onDelete: Cascade)
  name         String
  orderIndex   Int
  createdAt    DateTime @default(now())
  pois         Poi[]
  // Poi.group relation: onDelete SetNull (deleting a group → its POIs become Ungrouped)
```

Design notes:
1. **The "pool" is reframed, not removed.** "Unassigned" = POIs with `dayId = null`.
   The master list shows ALL POIs grouped; day columns show `dayId`-matching POIs.
2. **`groupId` and `dayId` are orthogonal** — organization vs scheduling, set
   independently.
3. **Deleting a group never deletes POIs** — they fall back to `groupId = null`
   (Ungrouped) via `onDelete: SetNull`.

## UI & Interactions (layout B — master list + day columns)

The map is unchanged. The right dock becomes two stacked, synced regions:

```
+ Add place (search / map-click)            [＋ New group]
── MASTER LIST (all places, grouped) ──
  ▾ Must-see
     ⠿ Uffizi        [Day 1 ▾]  ✕
     ⠿ Colosseum     [Day 3 ▾]  ✕
  ▾ Wineries
     ⠿ Chianti       [— ▾]      ✕
  ▾ Ungrouped
     ⠿ Gas stop      [— ▾]      ✕
── ITINERARY (days) ──
  Day 1   🚗 1h09  [Optimize]
     ⠿ Uffizi            🌙  ✕ (remove from day)
  Day 2 …   Day 3 …
  [Build route & split into days]  [Re-split all]
```

- **Master list:** POIs under collapsible group headers (incl. an "Ungrouped"
  section). Drag a POI between groups to refile (`groupId`/`orderInGroup`). Each
  row shows a **day badge** (`Day N` or `—`); the badge is a quick assign / change /
  unassign menu. The ✕ here **deletes** the POI.
- **List → day:** drag a POI onto a day section to **schedule** it (sets `dayId`);
  it stays in the master list (badge flips) and appears in that day's column.
- **Itinerary:** drag to reorder within a day / move between days; set overnight 🌙;
  **"remove from day"** ✕ = unschedule (`dayId = null`), keeping it in the list.
- **Groups:** create, rename (click header), delete (POIs → Ungrouped), reorder.

Mental model: **the master list is the source of truth for what places exist; the
day columns are a scheduling overlay. Remove-from-day ≠ delete.**

## Reuse of Existing Code

- **Day assignment reuses `movePoi(poiId, { dayId, orderInDay })`** (Phase 1b):
  list→day = set `dayId`; remove-from-day = `dayId: null`; reorder/move between days
  unchanged. No new day-assignment logic.
- **Routing/split engine untouched** — still keys on `dayId` / unassigned, ignores
  groups. "Build & split" distributes unscheduled POIs as today; "Re-split all"
  unchanged.
- **`removePoi`** unchanged for delete. `addPoi` gains an optional `groupId`.

## New Operations (dependency-injected, same pattern as existing)

```
createGroup(prisma, tripId, name)             → PoiGroup (orderIndex = next)
renameGroup(prisma, groupId, name)
deleteGroup(prisma, groupId)                  → reassigns its POIs to groupId=null
reorderGroups(prisma, tripId, orderedIds[])
moveToGroup(prisma, poiId, groupId|null, orderInGroup)   → refile + re-index group
```
Each with an API route and a TanStack Query mutation hook that invalidates the trip
(and route where relevant). The master list orders groups by `orderIndex` and POIs
within a group by `orderInGroup` (Ungrouped sorts last).

## Drag-and-Drop

`@dnd-kit/react` already models grouped multi-container sorting via the `move`
helper. This change adds container types: **group containers** (master list) and the
existing **day containers**, plus a **cross-region list→day** drag. The grouped
record passed to `move` becomes `{ group:<groupId|"ungrouped">: poiId[], day:<dayId>:
poiId[] }`. On drop:
- within/between group containers → `moveToGroup`.
- list→day or between/within days → `movePoi` (existing).
The day badge offers a non-drag path for assignment too.

## Error Handling

- Group ops validate the group/POI belongs to the trip (typed `ItineraryError` →
  400), consistent with existing operations; not-found → 404.
- Deleting a group is transactional (reassign POIs + delete group).
- Optimistic UI for drags (existing pattern); invalidate on settle.

## Testing

- Operation tests (temp DB, TDD): create/rename/delete-reassigns-to-ungrouped,
  reorderGroups, moveToGroup ordering and cross-group re-index, addPoi with groupId.
- Pure helpers if any (e.g. group re-index) unit-tested.
- Live smoke: add → put in a group → drag to a day → confirm it stays in the list
  with a day badge → remove-from-day (still in list) → delete (gone everywhere).

## Build Phases

- **Phase A — Catalog foundation:** `PoiGroup` model + `groupId`/`orderInGroup`;
  group CRUD operations + API + hooks; restructure the dock to render the **grouped
  master list** (all POIs, collapsible groups, Ungrouped) above the day columns;
  **day assignment via the badge menu** (reusing `movePoi`); delete vs remove-from-day.
  *Outcome: persistent grouped catalog; schedule via badge; play with it.*
- **Phase B — Full drag interactions:** drag POIs between groups; drag list→day;
  keep within/between-day dragging — all via the unified `@dnd-kit` grouped model.
  *Outcome: the fluid drag experience.*

Phase A delivers the architecture and a usable flow; Phase B adds the drag polish.

## Out of Scope / Future

Multi-day POIs, multi-group POIs, per-group color, group-aware splitting, and any AI
interaction with groups (Phase 3 AI may later suggest groups). Auth/ownership remains
deferred per the project security note.
