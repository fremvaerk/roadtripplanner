# MCP Trip-Planning Server — Implementation Plan

> **For agentic workers:** TDD for the pure helpers; the MCP server itself is verified by a smoke harness + a manual Claude run. `@modelcontextprotocol/sdk@1.29.0` is installed — check its actual API surface (`McpServer`, `StdioServerTransport`, `registerTool`/`tool` with zod) before writing. Bun runtime; bun auto-loads `.env`. Do NOT run prettier on large files. Stage only files you change per commit.

**Goal:** An MCP server exposing trip operations so Claude can plan a trip. Reuses `lib/itinerary/operations`, `lib/trips/service`, `lib/geocode`, `lib/routing/*`, scoped to a configured owner. Adds server-side place discovery.

---

### Task 1: server-side place discovery

**Files:** create `lib/places/search.ts`, `tests/places/search.test.ts`. Reuse `categoryFromTypes` from `lib/places/category`.

- [ ] `export type PlaceResult = { name: string; lat: number; lng: number; placeId: string | null; category: string | null; address: string | null; types: string[] }`.
- [ ] `searchPlacesText(query: string, opts?: { near?: { lat: number; lng: number }; radiusMeters?: number; limit?: number }, apiKey = process.env.GOOGLE_MAPS_SERVER_KEY): Promise<PlaceResult[]>` — POST `https://places.googleapis.com/v1/places:searchText`, headers `{ "Content-Type": "application/json", "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": "places.displayName,places.location,places.id,places.types,places.formattedAddress" }`, body `{ textQuery: query, maxResultCount: opts?.limit ?? 10, ...(opts?.near ? { locationBias: { circle: { center: { latitude, longitude }, radius: opts.radiusMeters ?? 50000 } } } : {}) }`. Throw a typed `PlaceSearchError` if no key or non-200.
- [ ] `searchPlacesNearby(center, radiusMeters, opts?)` — POST `:searchNearby` with `{ locationRestriction: { circle: { center, radius } }, includedTypes: opts?.includedTypes, maxResultCount, rankPreference: "POPULARITY" }`, same field mask/headers.
- [ ] A private `normalize(place)` → `PlaceResult`: `name = place.displayName?.text`, `lat = place.location.latitude`, `lng = place.location.longitude`, `placeId = place.id`, `address = place.formattedAddress`, `types = place.types ?? []`, `category = categoryFromTypes(types)`.
- [ ] Tests (mock global `fetch`): a fake response with one place normalizes correctly (lng/lat mapping, category from types); the field-mask + api-key headers are sent; non-200 throws `PlaceSearchError`; missing key throws. Use `mock`/monkeypatch `globalThis.fetch`, restore after.
- [ ] `bun run test tests/places/search.test.ts` + `bun run build`. Commit.

---

### Task 2: MCP server

**Files:** create `mcp/server.ts`. Add `@modelcontextprotocol/sdk` to `package.json` dependencies (it's already in node_modules; pin `^1.29.0`).

- [ ] **Imports:** `prisma` from `@/lib/db`; from `@/lib/itinerary/operations`: `addPoi, movePoi, setNight, addDay, insertDayAfter, removeDay, optimizeDay, ItineraryError`; from `@/lib/trips/service`: `createTrip, getTrip, listTrips`; `geocodePlace` from `@/lib/geocode`; `searchPlacesText, searchPlacesNearby` from `@/lib/places/search`; `buildDayRouteRequests, attributeLegDurations` from `@/lib/routing/itinerary-route`; `computeRouteChunked` from `@/lib/routing/routes`; the guards `requireWrite, requireRead, requireWriteForDay, requireWriteForPoi, HttpError` from `@/lib/auth/guards`; `Session` type.
- [ ] **Owner resolution (startup):** `const ownerEmail = (process.env.MCP_OWNER_EMAIL ?? process.env.ALLOWED_EMAILS ?? "").split(",")[0].trim().toLowerCase();` throw if empty. `const user = await prisma.user.upsert({ where: { email: ownerEmail }, update: {}, create: { email: ownerEmail, name: "MCP Owner" } });` `const session: Session = { userId: user.id, email: user.email };`.
- [ ] **Server:** `const server = new McpServer({ name: "roadtrip", version: "1.0.0" });`. Register each tool with `server.registerTool(name, { description, inputSchema: { ...zod fields } }, async (args) => ({ content: [{ type: "text", text: JSON.stringify(result) }] }))` (match the installed SDK's signature — verify). Wrap each handler in a try/catch that returns `{ content: [{ type: "text", text: "Error: " + msg }], isError: true }` for `ItineraryError`/`HttpError`/`Error`.
- [ ] **Tools** (see spec table). Notes:
  - `create_trip`: geocode `startName` → `createTrip(prisma, { title, description: description ?? "", startDate: startDate ? new Date(startDate) : null, dayCount, start: resolved }, session.userId)`; return `{ tripId: trip.id }`.
  - `get_trip` / `list_trips`: pass `session`.
  - `search_places`: if `nearLat`/`nearLng` given → `searchPlacesText(query, { near: { lat, lng }, radiusMeters, limit })`; else `searchPlacesText(query, { limit })`.
  - mutation tools: call the matching guard first (`requireWrite(prisma, session, tripId)`, `requireWriteForDay(prisma, session, dayId)`, `requireWriteForPoi(prisma, session, poiId)`) so a foreign id is rejected, then the operation.
  - `set_night`: `setNight(prisma, dayId, { lat, lng, title: name })`.
  - `build_route`: load `getTrip(prisma, tripId, session)` (gives days/pois/nights + routeVias); `const segments = buildDayRouteRequests(trip, trip.routeVias ?? [])`; `Promise.allSettled(segments.map(s => computeRouteChunked(s.waypoints, undefined, { legPolylines: false })))`; accumulate legDayId/seconds/meters like the `/route` API does; `attributeLegDurations(...)`; return `{ perDay: Object.entries(perDaySeconds).map(...), totalSeconds, totalMeters, failedDayIds }`. (Mirror `app/api/trips/[tripId]/route/route.ts` — read it.)
- [ ] **Connect:** `const transport = new StdioServerTransport(); await server.connect(transport);`. No `console.log` to stdout (it corrupts the stdio protocol — log to `console.error` only).
- [ ] `bun run build` still compiles the app (the mcp file is outside Next, but ensure no type errors via `bunx tsc --noEmit` if the project type-checks mcp/, else just `bun build mcp/server.ts --target=bun` to confirm it loads). Confirm `bun mcp/server.ts` starts without throwing (it'll wait on stdio — start it, see no crash, kill it). Commit.

---

### Task 3: registration + docs + smoke test

**Files:** create `.mcp.json`, `mcp/smoke.ts`; modify `package.json` (script), `.env.example` (MCP_OWNER_EMAIL), `README`/a docs note.

- [ ] `.mcp.json`:
  ```json
  { "mcpServers": { "roadtrip": { "command": "bun", "args": ["mcp/server.ts"] } } }
  ```
- [ ] `package.json` scripts: `"mcp": "bun mcp/server.ts"`.
- [ ] `.env.example`: add `MCP_OWNER_EMAIL=""` (note: defaults to first ALLOWED_EMAILS).
- [ ] `mcp/smoke.ts`: a small client using the SDK's in-memory or stdio transport that connects, calls `tools/list` (assert the expected tool names present), then calls `search_places { query: "UNESCO sites in Sweden" }` and `list_trips` and prints results. Run against `DATABASE_URL=file:./test.db`. This verifies the wiring end-to-end without Claude.
- [ ] A short docs section (in the design doc or a `docs/mcp.md`) on registering with Claude Code (`.mcp.json` auto-detected) and Claude Desktop (config snippet), the required env, and example prompts.
- [ ] Run `bun mcp/smoke.ts` → tools list + a place search succeed. Commit.

---

### Task 4: review + merge

- [ ] Review `git diff main...HEAD` vs the spec — focus: every mutation tool enforces owner write access (guards), no unscoped data access, no stdout pollution in the server, place-search error handling, the build_route accumulation matches the API. Apply high-confidence fixes.
- [ ] `superpowers:finishing-a-development-branch` → merge to `main` (`--no-ff`, delete branch). Note in a memory that the project now has an MCP server (and the in-app "Plan with AI" remains a future phase).
