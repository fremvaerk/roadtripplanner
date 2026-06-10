# Archive & Remove Trips — Design

**Date:** 2026-06-10
**Status:** Approved design, ready for implementation planning
**Type:** Feature on the existing roadtripplanner

## Summary

Let the user **archive** a trip (a soft, reversible hide) and **remove** a trip
permanently. Both are independent actions available from any trip — you can
archive then restore, or remove outright. Archived trips are hidden from the main
list behind a "Show archived" toggle. Permanent removal asks for a one-click
confirmation; archive/restore do not.

The backend already has a permanent `DELETE /api/trips/[tripId]` (cascades to
days/pois/groups/vias) but no UI and no archive concept. This feature adds the
archived state and all the UI to drive both actions.

## Goals

- An `archivedAt` timestamp on a trip (`null` = active).
- Archive / Restore / Remove actions on each trips-list row AND in the trip
  detail (planner) header.
- The trips list shows active trips by default with a "Show archived (N)" toggle
  that reveals archived trips inline (dimmed).
- Permanent remove is guarded by a simple confirmation dialog naming the trip.

## Non-Goals (YAGNI)

- A separate `/archived` page or a status enum / separate table (one nullable
  timestamp is enough for a single-user tool with two states).
- Bulk select / bulk archive / bulk delete.
- An "Undo" toast or trash-retention policy on permanent remove.
- Auth / per-trip ownership (unchanged single-user posture).

## Data Model — `prisma/schema.prisma`

Add one field to `Trip`:

```prisma
archivedAt DateTime?
```

`null` = active, a timestamp = archived (and records when). Apply with
`bunx prisma db push` to both `dev.db` and the test DB
(`DATABASE_URL="file:./test.db" bunx prisma db push`), then `bunx prisma generate`.

The existing relations already cascade on trip delete
(`Day`, `Poi`, `PoiGroup`, `RouteVia` are `onDelete: Cascade`; `Poi.day`/`Poi.group`
are `SetNull`), so permanent remove needs no extra cleanup.

## Service Layer — `lib/trips/service.ts`

Archive/restore go through the existing general `updateTrip` patch function — a
single code path for setting `archivedAt`, no separate helper:

- **Extend** `updateTrip`'s patch type with `archived?: boolean`, and inside set
  `if (patch.archived !== undefined) data.archivedAt = patch.archived ? new Date() : null;`.
- `deleteTrip(prisma, id)` — already exists (permanent, cascades). Unchanged.
- `listTrips(prisma)` — already returns all trips ordered by `updatedAt desc`;
  `archivedAt` is now included automatically. Unchanged. The client splits and
  sorts active vs archived (archived sorted by `archivedAt desc`).

## API

- **`PATCH /api/trips/[tripId]`** (existing handler): extend `updateTripSchema`
  with `archived: z.boolean().optional()`. (`updateTrip` gains the matching
  `archived?: boolean` patch field — see Service Layer.) The handler already
  spreads `...rest` (which includes `archived`) into `updateTrip`, so no handler
  change beyond the schema/service edits.
  - Archive  = `PATCH { "archived": true }`
  - Restore  = `PATCH { "archived": false }`
- **`DELETE /api/trips/[tripId]`** (existing handler): permanent remove. Unchanged.
- **Add** request helpers in `lib/api/trips.ts`, following the existing
  `fetch`-helper style:
  - `archiveTripRequest(tripId: string, archived: boolean): Promise<void>` →
    `PATCH /api/trips/${tripId}` with `{ archived }`.
  - `deleteTripRequest(tripId: string): Promise<void>` →
    `DELETE /api/trips/${tripId}`; treat 204 and 404 as success.

## Trips List — `app/page.tsx` + new `components/trips-list.tsx`

- `app/page.tsx` stays a **server component**: it fetches all trips via
  `listTrips` and renders `<TripsList trips={trips} />`. The inline `<ul>`/`<Link>`
  markup moves into the client component.
- **New** `components/trips-list.tsx` (`"use client"`):
  - Props: `{ trips: TripListItem[] }` where each item carries
    `id, title, startName, endName, isRoundTrip, archivedAt`.
  - Splits into `active` (`archivedAt == null`) and `archived`; active sorted as
    received (updatedAt desc), archived by `archivedAt desc`.
  - Renders the active list (existing card style). Below it, when `archived.length > 0`,
    a **"Show archived (N)"** toggle button; expanded, it lists archived trips with
    a dimmed style (e.g. `opacity-60`).
  - Each row has a **⋮ actions menu** (a small button revealing Archive/Restore/Remove;
    plain shadcn styling, no new dependency):
    - Active row → **Archive**, **Remove**.
    - Archived row → **Restore**, **Remove**.
  - Action handlers:
    - Archive  → `archiveTripRequest(id, true)`  then `router.refresh()`.
    - Restore  → `archiveTripRequest(id, false)` then `router.refresh()`.
    - Remove   → open `ConfirmDialog`; on confirm → `deleteTripRequest(id)` then
      `router.refresh()`.
  - Uses `useRouter().refresh()` from `next/navigation` to re-pull the server data
    after a mutation (no TanStack query backs this list).
  - Keep the empty-state ("No trips yet…") for when there are zero active trips and
    no archived trips.

## Trip Detail — `components/planner-shell.tsx`

In the sidebar header (next to the existing "← Trips" link and editable title):

- Show a small **"Archived"** badge when `trip.archivedAt != null`.
- Add actions:
  - If active → **Archive** button.
  - If archived → **Restore** button.
  - Always → **Remove** button (destructive style).
- Archive/Restore use a **TanStack mutation** (`useArchiveTrip(tripId)` in
  `hooks/use-trip-mutations.ts`, calling `archiveTripRequest`) that invalidates the
  trip query (`tripQueryKey(tripId)`) so the badge updates in place — the user stays
  on the page.
- Remove → open `ConfirmDialog`; on confirm → `deleteTripRequest(tripId)` then
  `router.push("/")` (the trip no longer exists).
- `useTrip` / `TripDetail` must expose `archivedAt` (add it to the trip query's
  selected/returned fields if not already present).

## Confirm Dialog — new `components/confirm-dialog.tsx`

A small reusable modal mirroring the `NightEditor` modal pattern (centered,
`fixed inset-0` backdrop, click-backdrop / Esc / Cancel to dismiss, no external
dependency):

- Props: `{ title: string; message: ReactNode; confirmLabel?: string; onConfirm: () => void; onClose: () => void; pending?: boolean }`.
- Layout: heading (`title`), body (`message`), footer with **Cancel** (outline) and a
  destructive **confirm** button (`confirmLabel ?? "Remove"`, disabled while `pending`).
- For trip removal: title "Remove trip?", message names the trip —
  "**{title}** and everything in it (days, places, route) will be permanently
  deleted. This cannot be undone."

## Data Flow

No new endpoints. Archive/Restore = `PATCH { archived }` → `updateTrip`.
Permanent remove = existing `DELETE` → `deleteTrip` (cascades). The list page
re-pulls via `router.refresh()`; the detail page invalidates the trip query
(archive/restore) or navigates home (remove).

## Error Handling

- `DELETE` or `PATCH` returning 404 (trip already gone) is treated as success →
  refresh / navigate.
- Other failures surface a brief inline error (e.g. an `alert` or a small inline
  message); the action can be retried. Archive is reversible, so low-risk.
- The confirm button is disabled (`pending`) while a remove is in flight to prevent
  double-fire.

## Testing

- **Service** (`bun test` against `test.db`):
  - `updateTrip(…, { archived: true })` sets `archivedAt`;
    `updateTrip(…, { archived: false })` clears it.
  - `deleteTrip` removes the trip and cascades — its days and pois are gone afterward.
  - `listTrips` returns archived rows too (each with `archivedAt`).
- **API**:
  - `PATCH { archived: true }` then `{ archived: false }` toggles `archivedAt`.
  - `DELETE` returns 204; a second `DELETE` returns 404.
- **UI — live smoke** (per the project's manual-verification approach):
  1. Active list shows trips; "Show archived" hidden when none archived.
  2. Archive a trip from a list row → it leaves the active list and appears under
     "Show archived (N)" (dimmed); Restore returns it to active.
  3. Remove from a list row → confirm dialog names the trip → confirm → trip gone;
     Cancel leaves it.
  4. In a trip's detail header: Archive shows the badge + Restore; Remove → confirm
     → navigates to `/` and the trip is gone.
  5. No console errors.

## Build Phases

1. Schema: add `archivedAt`, push to both DBs, generate; extend `updateTrip` with
   `archived` + service tests.
2. API: extend `updateTripSchema` for `archived`; add `lib/api/trips.ts` helpers;
   API tests.
3. `ConfirmDialog` component.
4. `TripsList` client component + wire `app/page.tsx` (toggle, ⋮ menu, archive/restore/remove).
5. Planner header actions (badge + Archive/Restore/Remove, `useArchiveTrip`, expose
   `archivedAt` on `useTrip`).
6. Verification (service + API tests, build, live smoke).

## Out of Scope / Future

Dedicated `/archived` page, bulk actions, undo/trash retention, status enum.
No-auth / IDOR posture unchanged (single-user local tool).
