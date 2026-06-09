# Editable Group Colors → Colored Markers — Design

**Date:** 2026-06-09
**Status:** Approved design, ready for implementation planning
**Type:** Feature on the existing roadtripplanner (Feature A of two; B = rich editable places, deferred)

## Summary

Give each place group an editable color. New groups auto-get the next color from a
curated palette; the user can change a group's color to another preset or a custom
hex. A place's map pin is tinted with its group's color; ungrouped (pool) places get
a neutral color. Each group's sidebar header shows an editable color dot (preset
swatches + custom picker), which doubles as the map legend.

## Goals

- `PoiGroup` stores a `color` (hex), auto-assigned from a palette on creation.
- User edits a group's color via preset swatches or a custom color picker.
- Map pins are colored by their place's group color; ungrouped places are neutral.
- The sidebar group header shows the color and is the place to edit it.

## Non-Goals (YAGNI)

- Per-place colors (color is a group property).
- Theming start/end/night markers (unchanged).
- Feature B (photos/descriptions/editing places) — separate spec, built next.

## Data Model

`PoiGroup` gains one column:
```
color String @default("#64748b")   // hex; default is a neutral fallback for the column
```
`@default` exists only so the column has a value for any pre-existing rows / inserts
that don't specify it. New groups always set `color` explicitly at creation (below).
Migration via `prisma db push` + `prisma generate` (existing trips are throwaway).

## Pure Helpers — `lib/places/group-colors.ts` (new, unit-tested)

```
PALETTE: string[]                       // ~8 curated, map-legible hex colors
UNGROUPED_COLOR: string                 // neutral slate for pool/ungrouped pins
defaultGroupColor(orderIndex: number): string   // PALETTE[((i % n) + n) % n]
darken(hex: string, amount = 0.2): string        // derive the pin border shade
isValidHexColor(s: string): boolean              // ^#[0-9a-fA-F]{6}$
```

`PALETTE` values are full 6-digit hex (`#rrggbb`). `darken` clamps each channel
toward 0 by `amount` and returns a 6-digit hex. `defaultGroupColor` handles
negative/large indices via the double-modulo.

## Backend

- **`createGroup` op** (`lib/itinerary/operations.ts`): set `color = defaultGroupColor(orderIndex)` where `orderIndex` is the new group's index (current group count). The op already computes the order index; reuse it.
- **`setGroupColor` op** (new): `setGroupColor(prisma, groupId, color)` → `prisma.poiGroup.update({ where: { id }, data: { color } })`.
- **Group PATCH route** (`app/api/groups/[groupId]/route.ts`): currently accepts `{ name }`. Extend its Zod schema to also accept an optional `color` validated by a hex regex (reuse `isValidHexColor` semantics via `z.string().regex(...)`). When `color` is present, call `setGroupColor`; when `name` is present, rename (both may be independent). Invalid hex → 400.
- **`getTrip`** (`lib/trips/service.ts`): the `poiGroups` include must return `color` (if it uses a field `select`, add `color`; if it returns the whole group, no change needed — verify).
- **`TripGroup` type** (`lib/api/trips.ts`): add `color: string`.

## Client

- **Fetcher** (`lib/api/trips.ts`): `setGroupColorRequest(groupId, color)` → `PATCH /api/groups/${groupId}` with `{ color }`. (Mirror the existing `renameGroupRequest`.)
- **Hook**: a `useSetGroupColor(tripId)` mutation (or extend the existing group-mutations hook) that PATCHes and invalidates the trip query (and route is unaffected, but invalidating trip refreshes pins + sidebar).

## UI

- **Group header** (wherever a group's name renders — `components/group-section.tsx`): add a small round **color dot button** before/after the name, filled with the group's `color`. Clicking it opens a compact popover containing:
  - the `PALETTE` as clickable swatches (selecting one PATCHes that color), and
  - a **custom** option: a native `<input type="color">` whose value defaults to the group's current color; on change, PATCH the chosen hex.
  Closing/selecting dismisses the popover. (Use the existing popover/menu primitives if present; otherwise a simple absolutely-positioned panel with an outside-click/Escape close, consistent with the map context menu.)
- **Map pins** (`components/trip-map.tsx`): `MapPoint` gains `color?: { background: string; border: string }`. The POI `<Pin>` uses `background={p.color?.background ?? UNGROUPED_COLOR}` and `borderColor={p.color?.border ?? darken(UNGROUPED_COLOR)}` (import the neutral + darken, or pass both already-computed from the planner — preferred: compute in the planner so `trip-map` stays presentational).
- **Planner** (`components/planner-shell.tsx`): when building `poiPoints`, look up each POI's group (`trip.poiGroups.find(g => g.id === poi.groupId)`); set `color = group ? { background: group.color, border: darken(group.color) } : { background: UNGROUPED_COLOR, border: darken(UNGROUPED_COLOR) }`.

## Error Handling

- Group PATCH with an invalid/missing-format `color` → 400 (Zod regex).
- A POI whose `groupId` no longer resolves (race) → falls back to the ungrouped color.
- Empty/whitespace color never reaches the DB (regex-guarded).

## Testing

- **Unit** (`tests/places/group-colors.test.ts`): `defaultGroupColor` wraps with modulo and is stable per index; `darken` returns a valid, darker 6-digit hex and clamps at 0; `isValidHexColor` accepts `#aabbcc`, rejects `#abc`, `abc`, `#gggggg`, ``.
- **Service** (`tests/itinerary/groups.test.ts`): `createGroup` assigns a palette color (e.g. group 0 → `PALETTE[0]`); `setGroupColor` updates the stored color.
- **Schema** (group route schema test if present, else covered by service): rejects a bad hex `color`.
- **Live smoke**: create 2–3 groups → each gets a distinct palette color; assign places to groups → pins take the group colors and the sidebar dots match; edit a group's color via a preset swatch and via the custom picker → its pins + dot update live; an ungrouped place shows the neutral color.

## Build Phases

1. Pure `group-colors.ts` helpers (TDD).
2. Schema `color` column + `createGroup` default + `setGroupColor` op + group PATCH `color` + `TripGroup.color` + getTrip include (TDD for ops/schema).
3. Client fetcher/hook + group-header color dot/popover + planner pin coloring + `trip-map` `MapPoint.color`.
4. Verification (unit + live smoke).

## Out of Scope / Future

Per-place colors, marker theming for start/end/night, and Feature B (rich editable
places). No-auth/IDOR posture unchanged (deferred per the project security note).
</content>
