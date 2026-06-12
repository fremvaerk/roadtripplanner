# MCP Trip-Planning Server — Design

**Goal:** Let an AI (Claude) plan a trip by exposing the app's operations as an **MCP server**. You ask Claude to "plan a 10-day Copenhagen→Nordkapp trip, nature + UNESCO, ~6h/day", and it calls the server's tools to create the trip, discover real places, assign them to days, set overnight stops, and check pacing — the result shows up in the app.

## Decisions

- **Transport:** a local **stdio** MCP server (`mcp/server.ts`, run with `bun run mcp`), registered via `.mcp.json` for Claude Code (and a documented snippet for Claude Desktop). `@modelcontextprotocol/sdk` (already present at 1.29.0) made an explicit dependency.
- **Connection:** **direct DB/lib access**, not the HTTP API. The server imports the app's `prisma`, `lib/itinerary/operations`, `lib/trips/service`, `lib/geocode`, and the routing libs, and operates **as a single configured owner**. No HTTP/OAuth — this is a local personal tool. It still goes through the access-scoped service + guards, so it only ever touches the owner's data.
- **Identity:** owner = `MCP_OWNER_EMAIL` (fallback: first entry of `ALLOWED_EMAILS`). On startup the server **upserts** that `User` and builds a `Session` `{ userId, email }`; every tool runs as that session. (So it works even before any web login.)
- **The one piece of genuinely new capability:** **server-side place discovery** (`lib/places/search.ts`) via the Google Places API (New), so Claude finds real places with accurate coordinates instead of inventing them. Reusable beyond MCP. Uses the existing `GOOGLE_MAPS_SERVER_KEY`.

## Tools

All inputs validated with zod. Mutations resolve the target's trip and enforce owner write access via the existing guards (so a stray id can't escape the owner's data). Each returns compact JSON text.

| Tool | Input | Backed by |
|---|---|---|
| `list_trips` | — | `listTrips(prisma, session)` → `[{id,title,role,startName,...}]` |
| `get_trip` | `{ tripId }` | `getTrip(prisma, tripId, session)` → days, places (with dayId/order), nights |
| `create_trip` | `{ title, startName, dayCount, startDate?, description? }` | `geocodePlace(startName)` → `createTrip(...)` → `{ tripId }` |
| `search_places` | `{ query, nearLat?, nearLng?, radiusMeters?, limit? }` | **NEW** Places text/nearby → `[{name,lat,lng,placeId,category,address}]` |
| `geocode` | `{ query }` | `geocodePlace` → `{name,lat,lng,placeId}` |
| `add_place` | `{ tripId, name, lat, lng, placeId?, category?, address?, description?, dayId? }` | `requireWrite` + `addPoi` → `{ poiId }` |
| `add_day` | `{ tripId }` | `requireWrite` + `addDay` |
| `insert_day` | `{ tripId, afterDayId }` | `requireWrite` + `insertDayAfter` |
| `remove_day` | `{ dayId }` | `requireWriteForDay` + `removeDay` |
| `assign_place_to_day` | `{ poiId, dayId\|null, orderInDay? }` | `requireWriteForPoi` + `movePoi` |
| `set_night` | `{ dayId, name, lat, lng }` | `requireWriteForDay` + `setNight` (title = name) |
| `optimize_day` | `{ dayId }` | `requireWriteForDay` + `optimizeDay` |
| `build_route` | `{ tripId }` | `requireRead` + compose `buildDayRouteRequests`→`computeRouteChunked`→`attributeLegDurations` → `{ perDay:[{dayId,seconds,meters}], total, failedDayIds }` so Claude can check the "~Xh/day" pacing and rebalance |

The planning *intelligence* is Claude composing these (create → search along the corridor → add → assign → set nights → build_route → adjust). The server stays a clean tool provider; it does not itself call an LLM.

## `lib/places/search.ts`

`searchPlacesText(query, { near?, radiusMeters?, limit? })` and `searchPlacesNearby(center, radiusMeters, { includedTypes?, limit? })` against `https://places.googleapis.com/v1/places:searchText` / `:searchNearby` (POST, `X-Goog-Api-Key` + `X-Goog-FieldMask: places.displayName,places.location,places.id,places.types,places.formattedAddress`). Normalize to `{ name, lat, lng, placeId, category, address, types }` (category via the existing `categoryFromTypes`). Throws a typed error on non-200 / missing key.

## Registration

`.mcp.json` at the repo root:
```json
{ "mcpServers": { "roadtrip": { "command": "bun", "args": ["mcp/server.ts"] } } }
```
`package.json` script `"mcp": "bun mcp/server.ts"`. The server reads env from `.env` (bun auto-loads). Document the Claude Desktop equivalent and the required env (`DATABASE_URL`, `GOOGLE_MAPS_SERVER_KEY`, `MCP_OWNER_EMAIL`/`ALLOWED_EMAILS`).

## Testing

Unit: `searchPlacesText`/`searchPlacesNearby` with a mocked `fetch` (normalization, field mask, error on non-200/no-key). A **smoke harness** (`mcp/smoke.ts` or a test using the SDK's in-memory transport) that lists tools and exercises `list_trips`, `search_places`, `create_trip` against `test.db`. The full planning loop is verified by actually driving the server from Claude (manual).

## Out of scope

In-app "Plan with AI" UI (a later phase — same tool layer, different front door), multi-user MCP auth/OAuth, vias/groups/archive tools (can add later), the server calling an LLM itself.
