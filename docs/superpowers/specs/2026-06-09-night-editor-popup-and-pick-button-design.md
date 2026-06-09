# Night Editor Popup + "Pick on Map" Button — Design

**Date:** 2026-06-09
**Status:** Approved design, ready for implementation planning
**Type:** Feature/refactor on the existing roadtripplanner

## Summary

Two coordinated changes:

1. **Explicit "📍 pick on map" button** on every location field. Today a field is
   armed for map-picking by *focusing* it; that conflicts with just wanting to type.
   Move arming to an explicit button beside each field — typing only searches,
   clicking 📍 arms the map (crosshair), clicking the map fills the field.

2. **Night-stop editor as a popup.** Replace the always-open inline night editor
   with a compact chip + an edit (✎) popup (like the place editor). Because a modal
   covers the map, the popup **hides itself while its location field is armed**, so
   "pick on map" still works, then reappears with the picked location.

## Goals

- A 📍 button on all five location fields (Change start, Search destination, Search
  a place to add, night "Where will you sleep?", night "Change location"); typing
  searches, the button arms map-pick.
- A set night shows a compact chip with ✎ (edit) and ✕ (remove).
- The ✎ popup edits title / link / notes / location; "pick on map" works from it by
  hiding the popup while armed and restoring it on pick/Escape.

## Non-Goals (YAGNI)

- Focus-to-arm (replaced by the button).
- A draggable/resizable popup; multi-night per day; per-night anything new.

## Part 1 — Arming via a button (`components/place-autocomplete.tsx`)

- **Remove** `onFocus` arming.
- **Add** a small 📍 button beside the `<Input>` (rendered only when `pickId` is set
  and a `MapPick` context exists). Layout: input + button in a `flex gap-1` row
  inside the existing wrapper; the predictions `<ul>` stays `absolute w-full`.
- The button **toggles** arming: `mapPick.armedId === pickId` → `disarm(pickId)`,
  else `arm(pickId, onPick)`. It shows an active style while armed
  (e.g. `bg-blue-100 text-blue-600`), `title`/`aria-label` "Pick on map".
- Keep: the armed ring on the wrapper; Escape on the input disarms; disarm after a
  search pick; disarm-on-unmount.
- **Hint while armed** (replaces the focus hint): a small line under the input,
  "Click the map to set this location · Esc to cancel." (For the night "Change
  location" field this hint is hidden along with the popup — the popup renders its
  own banner; see Part 2.)
- `trip-map` is unchanged — its armed-click → `consume` path already works; only the
  trigger moved from focus to the button.

## Part 2 — Night editor popup (`components/day-night.tsx`, + a `NightEditor` modal)

### Day card
- **No night** → keep the inline `PlaceAutocomplete` "🛏️ Where will you sleep?"
  (pickId `night-set:<dayId>`, so it now has the 📍 button) to create the night.
  Unchanged behavior (type or pick-on-map to create).
- **Night set** → a compact chip row: `🛏️ <title || "Night">` + an **✎ edit**
  button (opens the popup) + an **✕ remove** button (`clearNight`).

### The popup — `NightEditor` (centered modal, mirrors `PlaceEditor`)
- Props: `{ tripId, dayId, night, onClose }`.
- Local state seeded from `night`: `title`, `url`, `notes`, `lat`, `lng`, and a
  `locLabel` (display string for the current/pending location; initialise to the
  night's title or `"<lat>, <lng>"`).
- Fields: **Title** (Input), **Link** (Input) + a live clickable preview when set,
  **Notes** (Textarea), and a **location row**: a "📍 <locLabel>" line plus a
  `PlaceAutocomplete` "Change location…" (pickId `night-move:<dayId>`) whose
  `onPick` updates **local** `lat`/`lng`/`locLabel` (NOT an immediate mutation).
- **Save** → `updateNight.mutate({ dayId, title: title||null, url: url||null, notes: notes||null, lat, lng })` then `onClose()` (commit-all-on-save, like `PlaceEditor`). **Cancel**/backdrop/Esc close without saving.

### Hide-while-armed (the key mechanism)
- `const picking = mapPick?.armedId === \`night-move:${dayId}\`;`
- The modal root keeps the same markup but toggles visibility with Tailwind
  **`hidden`** (display:none) when `picking` — **it must stay mounted, not
  unmount**, otherwise the armed `PlaceAutocomplete` inside it unmounts and its
  disarm-on-unmount cleanup cancels the pick. `display:none` keeps the field
  mounted (armed persists) while removing the backdrop so the map is clickable.
- While `picking`, render a **floating banner** (a sibling of the hidden modal, so
  it's visible): "Click the map to place the night · Esc to cancel."
- Flow: click 📍 in the popup → `picking` true → modal hidden, banner shown,
  crosshair on map → click the map → `consume` calls the field's `onPick` → local
  `lat`/`lng`/`locLabel` update and `armedId` clears → modal reappears with the new
  location. Escape → `armedId` clears (global handler) → modal reappears unchanged.
- The 🛏️ map marker stays draggable (`onMoveNight`) as an alternative relocate.

## Data Flow

No backend changes. Night create still uses `setNight` (inline field). Night edits
(title/url/notes/lat/lng) commit on Save via the existing `updateNight`
(`PATCH /api/days/[dayId]/night`).

## Error Handling

- Empty title/url/notes saved as `null` (trim → null).
- Map-pick resolution reuses `trip-map`'s `resolvePlace` (place fetch or
  reverse-geocode, coordinate fallback) — already handles failures.
- Closing the popup while a pick is armed shouldn't happen (the modal is hidden, not
  closable, during picking); Escape disarms first and the modal returns. A defensive
  `disarm` on the popup's unmount covers any stray state.

## Testing

UI + Google SDK → `bun run build` + live smoke:
1. Each sidebar field shows a 📍 button; typing searches; clicking 📍 → crosshair →
   map click fills it (start/destination/add). Focus alone no longer arms.
2. A set night shows a chip; ✎ opens the popup with title/link/notes/location.
3. In the popup, edit fields; click 📍 → popup hides + banner + crosshair → click
   the map → popup returns with the new location → Save persists everything.
4. Esc during picking returns the popup unchanged; Esc/Cancel/backdrop close it.
5. Address search in the popup and dragging the 🛏️ marker still relocate. No console
   errors.

## Build Phases

1. `PlaceAutocomplete`: arming via a 📍 button (remove focus-arm), armed hint, ring.
2. `NightEditor` popup component (fields + Save + hide-while-armed + banner).
3. `day-night.tsx`: chip + ✎/✕ for a set night; open the popup; keep inline create.
4. Verification (build + live smoke).

## Out of Scope / Future

Focus-to-arm, popup drag/resize. No-auth/IDOR posture unchanged.
</content>
