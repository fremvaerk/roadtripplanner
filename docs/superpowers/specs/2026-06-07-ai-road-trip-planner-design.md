# AI Road Trip Planner — Design

**Date:** 2026-06-07
**Status:** Approved design, ready for implementation planning

## Summary

A web app for planning road trips, with AI doing the heavy lifting. The user
enters a start point, an optional end point (omitted = round trip), and a
free-text description of the trip they want. From there the app supports three
AI modes — generating a full day-by-day draft, suggesting a curated pool of
places to assemble, and an ongoing copilot — alongside full manual control over
a map-first interface. The trip is organized into days; the user assigns places
to specific days, can dump places into an unassigned pool and have the app build
an optimal route and split them into days, shape the route with draggable
control points, and choose where to spend each night.

## Goals & Context

- **Primary goal:** a personal tool for real use — end-to-end working flow
  matters most.
- **Platform:** web app, desktop-first, responsive for phone.
- **Maps/POI/routing:** Google Maps Platform (Places, Routes/Directions, Maps JS SDK).
- **AI:** Claude API (Anthropic), called server-side with streaming.
- **AI scope:** full draft + suggestion pool + copilot — all three, phased.
- **Persistence:** real backend + database (cross-device, single user).

## Technical Stack

Latest stable versions as of 2026-06; pin known-good latest rather than blind
`@latest`, to avoid fresh-major breakage.

| Concern | Library |
|---|---|
| Runtime + package manager + test runner | **Bun** |
| Framework | **Next.js 15 (App Router) + React 19** |
| UI components | **shadcn/ui** (Radix UI primitives + Tailwind CSS v4) — components copied into the repo, owned/editable |
| Google Maps in React | **`@vis.gl/react-google-maps`** (Google vis.gl team's modern wrapper) |
| ORM / DB | **Prisma 6**, SQLite (dev) → Postgres (deploy) |
| Drag & drop | **dnd-kit** (sortable + cross-container days ↔ pool) |
| Server state / fetching | **TanStack Query** (caching, optimistic updates, rollback) |
| Client UI state | **Zustand** |
| AI | **`@anthropic-ai/sdk`** (streaming + tool-use, server-side) |
| Validation / schemas | **Zod** (API + AI structured-output) |

Notes:
- shadcn/ui is the UI toolkit: a CLI that copies Radix-based, Tailwind-styled
  component source into the project — not a runtime dependency.
- Bun is the package manager / scripts / test runner; Next.js runs through its own
  (Node-compatible) toolchain under Bun. No pure-Bun runtime assumption.

## Architecture

A single Next.js app, three layers:

```
BROWSER (React)
  • Map-first planner UI (Google Maps JS SDK)
  • Day list + POI cards + AI chat panel (right dock)
  • Intake wizard (start / end / description / params) → mode picker
        │ fetch / streaming
SERVER (Next route handlers)
  • /api/trips ......... CRUD on trips
  • /api/itinerary/* ... itinerary operations (the core)
  • /api/ai/* .......... draft, suggest, chat (Claude)
  • /api/places/* ...... Places search/enrich (Google)
  • /api/route ......... legs + waypoint optimization
        │ Prisma
  SQLite→Postgres   |   Claude API   |   Google Maps Platform
```

**Stack:** see Technical Stack above. Next.js (React) full-stack monolith; server
route handlers are the backend. Google Maps rendered via
`@vis.gl/react-google-maps`; Places + Routes APIs called server-side so API keys
never reach the client. Claude API server-side with streaming.

### Keystone idea: shared itinerary operations

There is ONE set of itinerary operations (add POI, move POI between days,
reorder, optimize day, split pool into days, set constraints, set overnight,
add/remove route via-point). Both the **UI buttons** and the **AI's tools** call
these same operations. The AI never touches the database directly — it does
exactly what the buttons do. This keeps behavior consistent and predictable and
makes the core logic testable without any AI or network.

### Routing / day-split engine

A pure module (no I/O), heavily unit-tested:
- **Input:** POIs (lat/lng), corridor (start→end), constraints (drive cap, pace,
  dates), overnight anchors, and a distance/duration matrix from Google Routes.
- **Behavior:** day boundaries are driven by **overnight stops** (where you
  sleep). Claude proposes the day structure; the engine **enforces the hard
  drive-time cap** and reorders stops within each day via Google waypoint
  optimization. Splits days between consecutive overnights.
- Round trips: corridor loops back to start.
- Deterministic and explainable; Claude can request a re-split but does not
  compute geometry itself.

## Data Model (Prisma; SQLite → Postgres)

Start simple; extend later (per-POI time budgets, costs, booking links are future).

```
Trip
  id, title
  startLocation   (name, lat, lng, placeId)
  endLocation     (name, lat, lng, placeId, nullable → round trip = end==start)
  isRoundTrip     bool
  description     text         ← free-text brief the AI plans from
  startDate       date?        ← optional; enables hours/seasonality
  params          json         ← pace, interests, dailyDriveMax, travelStyle, budget
  createdAt, updatedAt

Day (ordered, belongs to Trip)
  id, tripId, dayIndex (0,1,2…), date?
  notes          text?        ← AI rationale / user notes
  // derives its overnight from the POI flagged isOvernight
  // computed at render: drive time, distance, ordered stops

Poi (a place; belongs to Trip)
  id, tripId
  dayId?         ← null = "unassigned pool"
  orderInDay     int?
  isOvernight    bool         ← one overnight per day; anchors day boundaries
  name, lat, lng
  placeId                     ← Google place_id; enrichment source of truth
  category       string       (sight, food, nature, lodging, …)
  source         enum         (ai | user | search | map)
  rating?, photoRef?, address?, openingHours? (json, cached from Places)
  aiReason?      text         ← why the AI suggested it
  userNote?      text
  status         enum         (suggested | accepted)  ← AI proposes without committing

RouteVia (route control point / via-point — routing hint, not a stop)
  id, tripId, dayId?          ← which day's leg it shapes (or trip-level)
  lat, lng
  orderIndex                  ← position along the route

ChatMessage (copilot history; belongs to Trip)
  id, tripId, role (user|assistant|tool), content json, createdAt
```

Design choices:
1. `Poi.dayId = null` = the unassigned pool — models "add POIs first, then split."
2. `status: suggested | accepted` — AI drops proposals without polluting the real
   plan; draft mode auto-accepts. Serves all three AI modes from one model.
3. `placeId` is the enrichment key — AI proposes a *name*, we resolve to a real,
   mappable place; rating/photos/hours cached on the POI.
4. `RouteVia` is separate from `Poi` — via-points bend the route
   (`stopover: false`) without becoming stops or affecting day-splitting.
5. `isOvernight` — overnights are the day-boundary anchors.

## AI Planning Pipeline

### ① Full draft (`/api/ai/draft`)
```
intake (start, end, description, params)
  → Claude generates structured proposal (world knowledge)
      [{ name, city, category, why, suggestedDay }]
  → resolve each name → Google Places (placeId, lat/lng, rating, photo, hours)
      · unresolved/duplicates dropped & logged, surfaced in chat
  → routing/day-split engine: order along corridor, cluster into days between
    overnight anchors, enforce dailyDriveMax
  → persist as POIs (status=accepted) assigned to Days
  → stream narrative summary into chat
```
Claude decides *what's worth seeing and why*; deterministic code decides
*geometry and day boundaries*.

### ② Suggestion pool (`/api/ai/suggest`)
Same resolve step, but POIs land in the unassigned pool with `status=suggested`
(faded pins/cards). User accepts/dismisses; "Build route & split into days" runs
the same engine. User can also add their own via search autocomplete or map click.

### ③ Copilot chat (`/api/ai/chat`, streaming, tool-use)
Claude is given tools mapping 1:1 to itinerary operations:
```
get_itinerary          search_places(query, near)
add_poi(placeId, day)  move_poi(poiId, day, pos)
remove_poi(poiId)      optimize_day(dayId)
split_pool_into_days() set_constraints({dailyDriveMax,…})
set_overnight(poiId)   add_via(lat,lng) / remove_via(id)
```
Tools return typed errors so Claude self-corrects; UI updates only on confirmed
success. Map + Days list re-render live; an inline note shows what the AI did.

## Planner UI & Interactions (map-first)

```
TOP BAR: trip title · dates · constraints ⚙
┌──────────────────────────────┬───────────────┐
│  BIG GOOGLE MAP              │  RIGHT DOCK    │
│  • route polyline (per-day)  │  [ Days | Chat]│
│  • numbered pins (accepted)  │  Day 1 ▾       │
│  • faded pins (suggested)    │   stops…       │
│  • hollow diamonds (via-pts) │  Day 2 ▾       │
│  • draggable route line      │  ──Pool──      │
│  [＋Add] [✦AI] [⟳Re-split]   │   ◌ suggested  │
└──────────────────────────────┴───────────────┘
```

- **Right dock, Days tab:** collapsible day sections with ordered stops +
  drive-time-to-next; an Unassigned pool at the bottom. Drag POIs between days /
  from pool (calls move_poi/add_poi). Per-day drive-time total; red flag if cap
  broken.
- **Right dock, Chat tab:** streamed copilot; inline tool-action notes; live
  map/list updates.
- **Bidirectional map ↔ list:** click pin → card highlights; hover card → pin
  bounces. Suggested POIs render faded with Accept ✓ / Dismiss ✕.
- **Three ways to add a place:** AI suggestion · search-box autocomplete ·
  **click any POI on the map**. All produce the same kind of stop.
- **Clickable map POIs:** native basemap POI icons are clickable (`clickableIcons`),
  click → placeId → Place Details → "Add to pool / Add to Day / 🌙 overnight."
  Optional opt-in **category exploration** bar (Food/Sights/Nature/Coffee/Lodging)
  runs Places Nearby Search over the viewport, cached per tile.
- **Draggable route control points:** grab the route polyline, pull onto a
  preferred road → drops a `RouteVia` (non-stopover waypoint). Drag off / to
  trash to remove. Rendered as hollow diamonds.
- **Overnight stops:** 🌙 toggle on a POI card, or drag the 🌙 between places /
  days to move the day boundary. AI sets sensible overnights in a draft; user
  overrides.
- **Responsive:** on phone, map + dock stack (map on top, tap to expand; dock
  below as primary scroll). Same components, CSS-driven.

## Entry Flow

Intake wizard (start / end / description / params) → **mode picker**:
*"Draft it all for me"* vs *"Suggest places, I'll assemble"* vs *"Empty, I'll
build it."* → planner.

## Error Handling

| Where | Failure | Handling |
|---|---|---|
| AI draft | place won't resolve / ambiguous | drop, log, tell user in chat; never insert a fake pin |
| AI draft | malformed structure | force structured output via tool-schema; one retry; then friendly error |
| Places/Routes | API error, quota, no route | inline banner, keep last good state, retry; day shows "route unavailable" |
| Day-split | day exceeds cap, unfixable by reorder | keep but flag red + "split this day?"; never silently violate |
| Copilot tool-use | bad id / impossible op | typed error back to Claude to self-correct; UI updates only on success |
| Network/save | save fails | optimistic UI with rollback; autosave with saved/saving/error indicator |

## API Cost Control

- Cache Place Details/photos/hours on `Poi` by `placeId`; never re-fetch on render.
- Cache Nearby Search per viewport tile; category exploration opt-in.
- Routes computed only on real change (add/move/optimize/via-edit), debounced —
  never per drag frame.
- Claude calls only on explicit actions (draft/suggest/chat); compact context.
- Target: stay within Google's free monthly credit + modest Claude spend.

## Testing Strategy

- **Routing/day-split engine** — pure unit tests (corridors, overnights, caps;
  assert day boundaries, cap enforcement, round-trip looping). Highest coverage.
- **Itinerary operations** — unit tests vs in-memory DB; covers UI and AI paths
  at once.
- **AI adapters** — mocked Claude/Google; test resolve→map pipeline and
  malformed-response handling.
- **E2E smoke** — intake → draft → planner renders; click-to-add; drag between days.

## Build Phases

- **Phase 0 — Foundation:** ✅ done. Next.js + Bun + Prisma 7 (SQLite, libSQL
  adapter) + shadcn/ui scaffold; Trip/Day/Poi models; map rendering of pins +
  straight-line route; trip CRUD. *Create a trip, see a map.*
- **Phase 1 — Manual planner (spine).** Split into two plans:
  - **Phase 1a:** client data layer (TanStack Query); shared itinerary operations
    (`addPoi`/`removePoi`); add places via Places-Autocomplete search **and**
    clickable map POIs; render the unassigned pool. *Add real places to a trip.*
  - **Phase 1b:** drag/drop between days and pool + reorder (dnd-kit); overnight
    (🌙) toggling that moves day boundaries. *Organize places into days by hand.*
  - **Deferred:** per-day **drive time** → Phase 2 (needs the Routes API, which
    lands there); the post-intake **mode picker** (Draft/Suggest/Empty) → Phase 3
    (it drives AI). Phase 1 intake creates the trip and goes straight to the planner.
  - **Note:** the search box uses the **new Places API** (`AutocompleteSuggestion`/
    `Place.fetchFields`), since the legacy `places.Autocomplete` widget is closed to
    new API customers (March 2025). Places still resolve to the same placeId/lat/lng.
- **Phase 2 — Routing/day-split engine:** pure engine + "Build route & split into
  days" + Re-split, overnight-anchored, drive-cap-enforced; draggable via-points;
  **real road route polyline + per-day drive time** (Routes/Directions API,
  replacing the Phase 0 straight line). *Dump POIs → ordered, day-split trip.*
- **Phase 3 — AI draft & suggest:** mode picker; `/api/ai/draft` and
  `/api/ai/suggest` resolving names → Places → engine. *The AI first impression.*
- **Phase 4 — AI copilot:** streaming chat with tool-use wired to itinerary
  operations; live updates; chat history.
- **Phase 5 — Polish:** category exploration; responsive/mobile; autosave
  indicators; cost-caching hardening; photos/hours on cards.

Each phase is independently shippable and testable. Phases 1–2 give a useful
manual planner; 3–4 are where the AI shines.

## Out of Scope (for now)

Multi-user/accounts beyond simple single-user, bookings/reservations, per-POI
cost tracking, native mobile app, offline mode. Revisit after the core tool is in
real use.
