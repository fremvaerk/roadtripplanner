# Resizable, Collapsible Planner Panel — Design

**Date:** 2026-06-10
**Status:** Approved design, ready for implementation planning
**Type:** UI layout change to the trip planner

## Summary

Move the planner's side panel (road-trip settings, Places, Days) from the right to
the **left**, make it **resizable** by dragging a handle on its right edge, and make
its three content sections **collapsible**. The panel width and each section's
collapsed/expanded state are remembered per-browser via `localStorage`. The map
fills the remaining space on the right.

## Background

`components/planner-shell.tsx` renders a flex row: the map (`<div className="relative flex-1">`)
then a fixed-width right sidebar (`<aside className="flex w-80 shrink-0 flex-col overflow-y-auto border-l p-4">`).
The aside holds, top to bottom: back link + title + Archive/Remove; the start/finish
summary; Start field; Finish mode (+ destination); Total driving; Start date; "Search
a place to add"; Build / Re-split buttons; **Places (N)** + `MasterList`; the **Days**
cards + "Add day".

## Goals

- The panel sits on the **left**; the map fills the right.
- A drag handle on the panel's right edge resizes it (width clamped, persisted).
- Three collapsible sections — **Settings**, **Places (N)**, **Days** — all expanded
  by default; collapse state persisted.
- Panel width + section states survive a reload (per-browser, no backend).

## Non-Goals (YAGNI)

- A collapse-the-whole-panel toggle, or a draggable/dockable panel.
- Per-trip or cross-device persistence (it's per-browser `localStorage`).
- Touch/pointer-drag gestures beyond a mouse drag (mouse `mousedown`/`mousemove`).
- Animating the collapse (instant show/hide is fine).

## Architecture

### 1. Layout — panel left, map right (`components/planner-shell.tsx`)

In the `flex h-screen w-full` row, the `<aside>` becomes the **first** child and the
map `<div className="relative flex-1">` the **second**. The aside:
- loses its fixed `w-80` and gets `style={{ width }}` from the resize hook;
- changes `border-l` → `border-r`;
- keeps `flex shrink-0 flex-col overflow-y-auto p-4`.

A **drag handle** element sits between the aside and the map (a full-height strip,
`w-1.5 cursor-col-resize hover:bg-accent`, with `onMouseDown` from the hook and
`role="separator"` + `aria-orientation="vertical"` for a11y).

### 2. Resize hook — `hooks/use-resizable-width.ts` (new)

```ts
useResizableWidth(key: string, opts: { initial: number; min: number; max: number })
  : { width: number; onHandleMouseDown: (e: React.MouseEvent) => void };
```

- Holds `width` state, initialized to `opts.initial` (NOT from `localStorage`, to
  avoid an SSR/hydration mismatch).
- A mount `useEffect` reads `localStorage[key]`; if a valid clamped number, sets it.
- `onHandleMouseDown(e)`: records the start `clientX` and current width, then adds
  `mousemove`/`mouseup` listeners to `window`. On move, the panel is on the LEFT so
  `width = clamp(startWidth + (e.clientX - startX), min, max)` (drag right ⇒ wider).
  On `mouseup`, removes the listeners and writes the final width to `localStorage`.
- A pure helper `clampWidth(value, min, max)` (in `lib/ui/clamp.ts`, exported) does
  `Math.min(max, Math.max(min, value))`; used by the hook and unit-tested.
- Constraints: `initial: 320`, `min: 280`, `max: 720`. Storage key `rtp.sidebarWidth`.

### 3. Collapsible section — `components/collapsible-section.tsx` (new)

```ts
CollapsibleSection({
  title: string;
  count?: number;
  storageKey: string;
  defaultOpen?: boolean;   // default true
  children: React.ReactNode;
})
```

- Renders a full-width header `<button>`: a chevron (`▾` when open, `▸` when closed),
  the `title`, and `count` (e.g. "Places (12)") when provided; below it, the
  `children` when open.
- `open` state initialized to `defaultOpen`; a mount `useEffect` reads
  `localStorage[storageKey]` (`"closed"` ⇒ false, `"open"` ⇒ true). Toggling writes
  `"open"`/`"closed"` back. (Default-open avoids a hydration mismatch on first paint.)
- Styling: plain — a small section header (`text-sm font-medium`), chevron in
  `text-muted-foreground`. Matches the existing sidebar typography.

### 4. Section composition (`components/planner-shell.tsx`)

**Always visible** (above the sections, unchanged): ← Trips link, Archive/Remove row,
editable title, the start→finish summary `<p>`, and "Total driving …".

Wrap the remaining content into three `CollapsibleSection`s:
- **Settings** (`storageKey="rtp.section.settings"`): Start field, Finish mode (+ the
  destination `PlaceAutocomplete` when mode = place), Start date.
- **Places** (`storageKey="rtp.section.places"`, `count={trip.pois.length}`):
  "Search a place to add", the Build / Re-split buttons, and `<MasterList>`.
- **Days** (`storageKey="rtp.section.days"`, `count={trip.days.length}`): the
  `DragDropProvider` day cards + "Add day".

No behavior inside the sections changes — only their wrapping.

## Data Flow

Pure presentation; no API or data-model change. The hook and sections read/write
`localStorage` only. The map already fills `flex-1`, so it reflows as the panel width
changes.

## Error Handling / Edge Cases

- `localStorage` unavailable (SSR or privacy mode): reads/writes are wrapped in
  try/catch; on failure the defaults (width 320, all open) apply silently.
- A stored width outside `[min, max]` is clamped on load.
- During a drag, `user-select` is suppressed on the body (set `document.body.style.userSelect = "none"` on mousedown, restore on mouseup) so text isn't selected while dragging.

## Testing

- **Unit** (`tests/ui/clamp.test.ts`): `clampWidth` clamps below min, above max, and
  passes through in-range values.
- **Live smoke** (`bun run build` + browser): the panel is on the left with the map
  on the right; dragging the handle resizes the panel and the width persists across a
  reload; each of Settings / Places / Days collapses and expands and the state
  persists across a reload; all three start expanded on a fresh browser; no console
  errors.

## Build Phases

1. `clampWidth` helper (+ unit test) and `useResizableWidth` hook.
2. `CollapsibleSection` component.
3. `planner-shell.tsx`: move the panel left, add the drag handle + width, wrap the
   three sections.
4. Verification (unit test, build, live smoke).

## Out of Scope / Future

A whole-panel collapse, drag-to-dock, touch gestures, server/cross-device persistence.
No-auth posture unchanged.
