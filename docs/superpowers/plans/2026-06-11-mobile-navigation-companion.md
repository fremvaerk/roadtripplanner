# Mobile Navigation Companion — Implementation Plan (Phase 1)

> **For agentic workers:** TDD for the pure helpers; the React components are verified by build + a mobile-viewport live smoke test. Next.js 16 (`viewport` is its own export, not in `metadata`). Do NOT run `bunx prettier --write` on large files (`planner-shell.tsx`, `trip-map.tsx`) — no prettier config; it reflows them. Stage only the files you change per commit (never `git add -A`).

**Goal:** A mobile-first, read-only navigation companion for a trip: pick a day (auto-today), see the ordered stops, tap **Navigate** to launch Google Maps from current location. Phases 2–3 (responsive editing planner, PWA/offline) are in the spec roadmap — not this build.

**Reuse:** `useTrip`/`useRoute`, `buildExportModel` (`lib/export/itinerary-model.ts`), `dayDirectionsUrl` (`lib/export/maps-links.ts`), `dayDate` (`lib/dates.ts`). Map: `@vis.gl/react-google-maps`.

---

### Task 1: shared helpers + viewport

**Files:** `app/layout.tsx`, `lib/export/maps-links.ts` (+ `tests/export/maps-links.test.ts`), `lib/dates.ts` (+ `tests/dates.test.ts` create), `lib/format.ts` (create) + `components/planner-shell.tsx` (use it).

- [ ] **Viewport** — in `app/layout.tsx` add `import type { Viewport } from "next"` and `export const viewport: Viewport = { width: "device-width", initialScale: 1 };` (Next 16 reads this separately from `metadata`).
- [ ] **`stopDirectionsUrl`** in `lib/export/maps-links.ts`:
  ```ts
  /** Google Maps directions to a single stop from the device's current location (no origin). */
  export function stopDirectionsUrl(stop: { lat: number; lng: number }): string {
    return `https://www.google.com/maps/dir/?api=1&destination=${stop.lat},${stop.lng}&travelmode=driving`;
  }
  ```
  Test: returns `…/dir/?api=1&destination=10,20&travelmode=driving`; contains no `origin=` and no `waypoints=`.
- [ ] **`todayDayIndex`** in `lib/dates.ts`:
  ```ts
  /** 0-based index of the day that is "today" (UTC), or null if today is outside the trip. */
  export function todayDayIndex(startDateISO: string | null, dayCount: number, now: Date = new Date()): number | null {
    if (!startDateISO || dayCount <= 0) return null;
    const start = dayDate(startDateISO, 0);
    if (!start) return null;
    const todayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const diffDays = Math.floor((todayUTC - start.getTime()) / 86_400_000);
    return diffDays >= 0 && diffDays < dayCount ? diffDays : null;
  }
  ```
  Test (`tests/dates.test.ts`, pass an explicit `now`): start `2026-06-12`, 3 days → `now=2026-06-13` → 1; `now=2026-06-12` → 0; `now=2026-06-15` (day after last) → null; `now=2026-06-11` (before) → null; `startDateISO=null` → null.
- [ ] **Extract formatters** — `lib/format.ts`:
  ```ts
  export function formatDuration(seconds: number): string { /* move the body from planner-shell.tsx */ }
  export function formatKm(meters: number): string { return `${Math.round(meters / 1000)} km`; }
  ```
  Copy the exact `formatDuration` body currently in `planner-shell.tsx` (h/min logic). Then in `planner-shell.tsx` replace its two local functions with `import { formatDuration, formatKm } from "@/lib/format";` (hand-edit; remove the local defs). Verify the planner still builds.
- [ ] `bun run test` (new helper tests pass) + `bun run build`. Commit.

---

### Task 2: CompanionMap (light, day-scoped, read-only)

**Files:** create `components/mobile/companion-map.tsx`.

A self-contained map for ONE day. Mirror the map setup in `trip-map.tsx` (mapId from `process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID ?? "DEMO_MAP_ID"`, `gestureHandling="greedy"`), but no editing.

- [ ] Props: `{ day: ExportDay; start: ExportPoint; focusTarget?: { lat: number; lng: number; key: number } | null }` (import `ExportDay`/`ExportPoint` from `@/lib/export/itinerary-model`).
- [ ] Render `<Map style={{width:'100%',height:'100%'}} defaultZoom={9} defaultCenter={day.stops[0] ?? day.origin ?? start} mapId gestureHandling="greedy">`:
  - The day's route as a `<Polyline>`-equivalent: use the `geometry` library like `trip-map.tsx` does, OR draw a simple polyline. Simplest: a thin component that, via `useMap()` + `useMapsLibrary("maps")`, creates a `new google.maps.Polyline({ path: day.path, strokeColor: day.color, strokeWeight: 4 })` in an effect (cleanup on unmount). If `day.path` is empty, build a straight path through `[origin?, ...stops, night?]`.
  - `<AdvancedMarker>` for each stop with a small numbered indigo/`day.color` pin (reuse the numbered-circle div style from the night markers in `trip-map.tsx`), and a distinct marker for the night (🛏 or a circle), and the day origin.
  - An effect that `fitBounds` to all the day's points (stops + night + origin + path) on mount / when `day` changes (mirror the `FitBounds` helper in `trip-map.tsx`).
  - An effect on `focusTarget` that `map.panTo(...)` + ensures a min zoom (mirror `trip-map.tsx`'s focus effect).
- [ ] `bun run build` compiles. Commit. (No unit test — visual; smoke-tested in Task 5.)

---

### Task 3: NavCompanion

**Files:** create `components/mobile/nav-companion.tsx`. Reuse `useTrip`, `useRoute`, `buildExportModel`, `dayDirectionsUrl`, `stopDirectionsUrl`, `todayDayIndex`, `formatDuration`/`formatKm`, `UserMenu`.

- [ ] Props `{ tripId: string; role?: "owner"|"editor"|"viewer" }`. Load `const { data: trip } = useTrip(tripId); const { data: route } = useRoute(tripId);` show a loading state until `trip`. `const model = useMemo(() => buildExportModel(trip, route), [trip, route])`.
- [ ] State `const [dayIndex, setDayIndex] = useState(0)`; in an effect once trip loads, set it to `todayDayIndex(trip.startDate, trip.days.length) ?? 0`. `const [focus, setFocus] = useState<{lat,lng,key}|null>(null)` + an incrementing key (mirror planner-shell's `focusPlace`).
- [ ] Layout (mobile-first; `mx-auto max-w-md` so it also looks fine on desktop / the `/go` route):
  - **Header** row: trip title (truncate), a small "Planner" link to `/trips/${tripId}` and `<UserMenu session=… />` — wait, the companion is a client component and has no session prop. Instead render just a "Planner ↗" link and a "Trips" link to `/`. (Sign-out lives on the home page; keep the companion lean.)
  - **Day chips:** a horizontally-scrollable `flex gap-2 overflow-x-auto` of buttons, one per `model.days`, label `Day ${d.index+1}` + (if dated) the short date; the selected chip highlighted; `onClick` sets `dayIndex`.
  - **Map:** `<div className="h-[40vh] w-full overflow-hidden rounded-md border"><CompanionMap day={model.days[dayIndex]} start={model.start} focusTarget={focus} /></div>` (wrap in the existing `APIProvider`? The planner wraps the map in `<APIProvider>` — check `planner-shell.tsx`. The companion must also provide `<APIProvider apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!}>` around the map, like planner-shell does).
  - **Navigate whole day** button → `window.open(dayDirectionsUrl(model, dayIndex).url, "_blank")`.
  - **Stop timeline:** `model.days[dayIndex]`: an "Start: {origin.name}" line; then `stops.map(stop => <StopCard>)`; then the night card if present. Each `StopCard`: thumbnail (`imageUrl` with broken-image fallback like `poi-card.tsx`, else a 📍 placeholder), name (font-medium), category + address (muted), and — for stops that have an outgoing leg — the `🚗 {formatDuration·formatKm}` to the next (compute a `legLabelByStopIndex` from `route.legs` for this day, keyed by stop order, or reuse the model: the model day doesn't carry per-leg numbers, so read them from `route.legs` filtered by `dayId` and matched by `afterPoiId`; simplest: build a `Record<poiId,label>` like planner-shell does — but the export model stops don't carry poi ids. → Add the poi `id` to `ExportPlace` in `itinerary-model.ts` (optional field, set from `p.id`) so the companion can match legs by `afterPoiId`. Update the model builder + a test). A big **▶ Navigate** button (`window.open(stopDirectionsUrl(stop), "_blank")`). Tapping the card body (not the button) calls `setFocus({lat,lng,key:++})`.
  - Respect read-only implicitly (there are no edit controls here at all).
- [ ] `bun run build` + `bun run test`. Commit.

---

### Task 4: responsive routing

**Files:** create `hooks/use-is-mobile.ts`, `components/trip-view.tsx`; modify `app/trips/[tripId]/page.tsx`; create `app/trips/[tripId]/go/page.tsx`.

- [ ] `hooks/use-is-mobile.ts`:
  ```ts
  "use client";
  import { useEffect, useState } from "react";
  export function useIsMobile(query = "(max-width: 767px)"): boolean | null {
    const [m, setM] = useState<boolean | null>(null);
    useEffect(() => {
      const mq = window.matchMedia(query);
      const f = () => setM(mq.matches);
      f(); mq.addEventListener("change", f); return () => mq.removeEventListener("change", f);
    }, [query]);
    return m; // null until mounted
  }
  ```
- [ ] `components/trip-view.tsx` ("use client"): `{ tripId, role }` → `const isMobile = useIsMobile();` if `isMobile === null` render a minimal centered skeleton (`<div className="p-8 text-sm text-muted-foreground">Loading…</div>`); else `isMobile ? <NavCompanion tripId role /> : <PlannerShell tripId role />`.
- [ ] `app/trips/[tripId]/page.tsx`: replace `return <PlannerShell .../>` with `return <TripView tripId={tripId} role={trip.role} />` (keep the server-side auth + getTrip). Import TripView.
- [ ] `app/trips/[tripId]/go/page.tsx`: same server auth/getTrip as the trip page, but always `return <NavCompanion tripId={tripId} role={trip.role} />` (explicit companion). `export const dynamic = "force-dynamic"`.
- [ ] `bun run build`. Commit.

---

### Task 5: verify + review + merge

- [ ] Live smoke at a 390×844 viewport on a trip: open `/trips/[id]/go` → day chips render, today auto-selected (or Day 1), map shows the selected day, stop cards show thumbnail/name/category/address + leg times, **Navigate** buttons have `…/dir/?api=1&destination=…` (per stop) and the whole-day link, tapping a chip changes the day + map, tapping a card focuses the map. Then resize to desktop width and confirm `/trips/[id]` shows the **planner**, and at phone width shows the **companion**. No console errors. `bun run build` + `bun run test` green.
- [ ] Dispatch a review over `git diff main...HEAD` vs the spec (focus: read-only correctness, no edit leakage, the responsive swap has no hydration mismatch, the Navigate URLs, role respected). Apply high-confidence fixes; then `superpowers:finishing-a-development-branch` to merge (`--no-ff`, delete branch).
