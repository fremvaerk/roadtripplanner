# Mobile Navigation Companion — Design

**Goal:** Make a trip usable from a phone, focused on **navigation**: open a trip on mobile and get a clean, thumb-friendly, read-only view that shows the day's stops and launches Google Maps turn-by-turn (delegated — we don't build turn-by-turn). The full editing planner stays desktop-only for now, with mobile support planned as a later phase.

## Decisions

- **Companion first.** A dedicated mobile-first, read-only navigation view. The full responsive planner is **Phase 2** (roadmap below); the architecture must leave room for it.
- **Delegate turn-by-turn to Google Maps.** The companion is a launcher/reference. The key primitive is **per-stop "navigate from current location"**: `…/dir/?api=1&destination=<lat,lng>&travelmode=driving` with **no origin**, so Google routes from the phone's live GPS to the next stop.
- **Read-only.** Works for owner/editor/viewer (anyone with read access). No editing on mobile yet.
- **PWA / offline:** deferred (Phase 3).

## Phase 1 — the companion (this build)

### Reaching it
- Add the missing **viewport** (`width=device-width, initial-scale=1`) so mobile renders at device width.
- `/trips/[tripId]` becomes **responsive at the routing level**: a small client wrapper (`TripView`) picks the **companion** on phones (`max-width: 767px`) and the **planner** on desktop, using a `useIsMobile()` media-query hook. To avoid a hydration mismatch / wrong-component flash, it renders a neutral skeleton until mounted, then swaps.
- A stable explicit route **`/trips/[tripId]/go`** always renders the companion (bookmark/QR/desktop-preview).

### The companion (`components/mobile/nav-companion.tsx`)
Consumes `useTrip(tripId)` + `useRoute(tripId)` → `buildExportModel(trip, route)`. Read-only; takes `{ tripId, role }`.
- **Header:** trip title; a link to the full planner (`/trips/[tripId]` on a wide screen) and the user menu / back to trips.
- **Day selector:** a horizontally-scrollable row of day chips (`Day N · short date`), **auto-selecting "today"** when the current date falls inside the trip (`todayDayIndex(startDate, dayCount)`), else Day 1.
- **Compact route map** (`components/mobile/companion-map.tsx`, ~40vh): a self-contained `<Map gestureHandling="greedy">` showing the **selected day** only — the day's decoded route polyline (`model.days[i].path`), numbered stop markers, the night marker, and the day's origin; auto-fits the day's bounds. Accepts a `focusTarget` so tapping a stop pans to it. (Deliberately lighter than the editing `TripMap` — no edit wiring.)
- **Stop timeline:** the selected day's items in order — an "Start: <origin>" line, then each stop as a card (thumbnail, name, category, address, and the driving **time · distance to the next** stop from the route legs), then the night. Tapping a card focuses the map. Each stop and the night has a prominent **▶ Navigate** button → `stopDirectionsUrl(stop)` (current-location origin). A **Navigate whole day** button uses the existing `dayDirectionsUrl(model, i)`.

### New shared helpers
- `lib/export/maps-links.ts` → `stopDirectionsUrl({lat,lng})` (destination-only Google Maps URL) + test.
- `lib/dates.ts` → `todayDayIndex(startDate, dayCount, now?)`: the 0-based index of the day whose date is "today" (UTC), or `null` if today is outside the trip / no start date. Test with an injected `now`.

### Reuse / boundaries
- Reuses: the trip/route queries, `buildExportModel`, maps-links, `formatDuration`/`formatKm` (extract these two from `planner-shell.tsx` into `lib/format.ts` so the companion shares them), `PoiDetail`/role types, and the read-only role data already on the trip.
- The companion is its **own component tree** (not PlannerShell) so Phase 2 can evolve them independently. The map is a new light component, not `TripMap`.

## Phase 2 — full responsive planner (roadmap, not now)
Make the editing planner usable on phones: a **Map ⇄ List toggle** + drawer sidebar (replacing the fixed-width side-by-side split and the mouse-only resize), touch-friendly drag-and-drop, and a toggle so a mobile user can switch **companion ⇄ full planner**. Phase 1 keeps the companion and planner as separate trees sharing data/helpers so this slots in.

## Phase 3 — optional, later
Installable **PWA** (manifest, icons, theme-color, apple tags, full-screen) and **offline itinerary** caching (service worker over the app shell + last-synced trip) for dead zones.

## Testing
Unit: `stopDirectionsUrl` (destination-only, no origin/waypoints); `todayDayIndex` (today inside trip → index; before/after → null; no startDate → null; boundary days). Live: open `/trips/[id]/go` at a 390px viewport — day chips, auto-today, stop cards with thumbnails + leg times, Navigate links resolve to the right Google Maps URLs, map shows the selected day, card-tap focuses the map; confirm desktop still gets the planner and `/trips/[id]` swaps by width. Existing planner unaffected.

## Out of scope (Phase 1)
Editing on mobile, PWA/offline, in-app live position / "next stop" auto-advance, marking stops visited, a lighter rewrite of `TripMap`.
