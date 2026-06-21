# Fix: route vias collapse to Day 1 — anchor vias to a day

**Bug:** A route via is anchored only by `afterPoiId`. Legs that leave a **night**
report `afterPoiId: null` (nights have no POI), so every null-anchored via attaches
to the trip start = Day 1. Clicking the entry leg of any day-after-a-night adds the
control point to Day 1.

**Fix (matches the schema's pattern — Poi & NightStop both have `dayId`):** add a
nullable `dayId` to `RouteVia`. A via belongs to a day; `afterPoiId` only orders it
*within* that day (`null` = the day's entry leg, right after the night/start). The
route builder keys vias by `(dayId, afterPoiId)`; the map already knows each leg's
`dayId` to pass along. All additive/backward-compatible. Ship as **v1.0.4**.

> Bun + Next 16, Prisma 7/libSQL (`db push`, no migration files). `dayId` is a
> plain `String?` column (no relation) — exactly like the existing `afterPoiId`.

## Steps

1. **Schema** (`prisma/schema.prisma`): `RouteVia` gets `dayId String?`. Run
   `bun run db:push` (or the project's push script) + regenerate client. Update
   `tests` DB too (`bun run test:db`).

2. **Type** (`lib/api/trips.ts` + `lib/routing/itinerary-route.ts`): `TripVia` gets
   `dayId: string | null`.

3. **Route builder** (`lib/routing/itinerary-route.ts`, `buildDayRouteRequests`) — TDD:
   - Split vias: `afterPoiId != null` → keyed by poiId (existing, requires the poi
     scheduled). `afterPoiId == null` → **entry vias** keyed by `dayId`. Legacy vias
     (`afterPoiId == null && dayId == null`) → treat as the first day's entry (start
     node), preserving old behavior.
   - Attach each day's entry vias to the node that *precedes* that day's first stop
     (the start node for the first day; the previous day's **night** node otherwise).
     Track a `prevBoundaryIndex`, advanced to the last node after each day.
   - Sort each anchor's vias by `seq`.
   - Tests (extend `tests/routing/build-route.test.ts`): a via `{dayId:"d2",
     afterPoiId:null}` lands on day 2's entry leg (between night and d2's first
     stop), NOT day 1; a legacy `{dayId:null, afterPoiId:null}` still lands at the
     start; existing afterPoiId tests stay green.

4. **addVia** (`lib/itinerary/operations.ts`): accept `dayId`. seq scoped per anchor
   — `where { tripId, afterPoiId, dayId }`. Persist `dayId`.
   - Schema (`lib/itinerary/schema.ts` `addViaSchema`): add `dayId: z.string().nullable().optional()`.
   - API route already passes `parsed.data` through — fine once schema allows it.

5. **Client + hook**: `addViaRequest(tripId, afterPoiId, dayId, lat, lng)`
   (`lib/api/trips.ts`); `useAddVia` passes `dayId` (`hooks/use-via-mutations.ts`).

6. **Map** (`components/trip-map.tsx`): `LegPath`/`nearestLeg` carry `dayId`; both
   add-via paths (polyline `click` ~L531, context-menu `nearestLeg` ~L366) pass
   `(afterPoiId, dayId)`. `onAddVia(afterPoiId, dayId, lat, lng)`. legPaths map adds
   `dayId: l.dayId`. (`lib/routing/nearest-leg.ts` `LegPath` += `dayId`.)
   - `planner-shell.tsx`: `onAddVia={(afterPoiId, dayId, lat, lng) => addVia.mutate({ afterPoiId, dayId, lat, lng })}`.

7. **Export/import** (`lib/trips/transfer.ts`): serialize `dayId` on vias; import
   remaps it via `dayIdMap` (like `poi.dayId`); schema allows nullable `dayId`.
   Test: a via's `dayId` is remapped to the new day.

8. **Verify**: `bun run build`, full `bun run test`. Manual: dev server — click a
   day-N entry leg → via lands on day N.

9. **Review** (code-reviewer subagent): builder correctness (entry-via attachment,
   legacy fallback, no FK errors), ownership unaffected, export/import remap. Then
   merge `--no-ff`, push, tag **v1.0.4**.
