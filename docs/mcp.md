# Road-trip MCP server

`mcp/server.ts` is a stdio [Model Context Protocol](https://modelcontextprotocol.io)
server that exposes the road-trip planner's operations as tools, so an AI client
(Claude Code, Claude Desktop) can plan trips end to end: create a trip, search
for and add real places, organise them into days, set overnight stops, and
compute driving routes.

The server resolves a single **owner** from `MCP_OWNER_EMAIL` (falling back to the
first `ALLOWED_EMAILS` entry), upserts that user, and performs every operation as
them. There is no per-request auth — it acts as one configured user.

## Required environment

The server reads its environment from the spawning process (Bun auto-loads `.env`
when run directly):

| Variable                 | Purpose                                                        |
| ------------------------ | ------------------------------------------------------------- |
| `DATABASE_URL`           | SQLite/libSQL connection string, e.g. `file:./dev.db`.        |
| `AUTH_SECRET`            | ≥32 chars; imported transitively via `lib/db` → session.      |
| `GOOGLE_MAPS_SERVER_KEY` | Geocoding/Places/Routes — needed for search, geocode, routing.|
| `MCP_OWNER_EMAIL`        | Owner the server acts as. Defaults to first `ALLOWED_EMAILS`. |

## Registering with Claude Code

The repo ships a `.mcp.json` at its root, which Claude Code auto-detects when you
open the project:

```json
{
  "mcpServers": {
    "roadtrip": {
      "command": "bun",
      "args": ["mcp/server.ts"]
    }
  }
}
```

Confirm it's picked up:

```bash
claude mcp list
```

The server inherits the shell's environment, so make sure `DATABASE_URL`,
`AUTH_SECRET`, `GOOGLE_MAPS_SERVER_KEY`, and `MCP_OWNER_EMAIL` are exported (or
present in `.env`, which Bun loads automatically).

## Registering with Claude Desktop

Add the server to `claude_desktop_config.json` (Settings → Developer → Edit
Config). Use an absolute `cwd` so Bun resolves the project and `.env`, and pass
env explicitly:

```json
{
  "mcpServers": {
    "roadtrip": {
      "command": "bun",
      "args": ["mcp/server.ts"],
      "cwd": "/absolute/path/to/roadtripplanner",
      "env": {
        "DATABASE_URL": "file:./dev.db",
        "AUTH_SECRET": "<at-least-32-characters>",
        "GOOGLE_MAPS_SERVER_KEY": "<your-server-key>",
        "MCP_OWNER_EMAIL": "you@example.com"
      }
    }
  }
}
```

Restart Claude Desktop, then check the tools (hammer) menu for the `roadtrip`
server.

## Tools

| Tool                   | What it does                                                              |
| ---------------------- | ------------------------------------------------------------------------ |
| `list_trips`           | List all trips owned by or shared with the owner.                        |
| `get_trip`             | Fetch one trip with its days, places, nights and route vias.             |
| `create_trip`          | Create a trip; the start location name is geocoded automatically.        |
| `search_places`        | Text place search, optionally biased/restricted to a point + radius.     |
| `search_places_nearby` | Find popular places within a radius around a center point.               |
| `geocode`              | Resolve a name/address to name, lat, lng and placeId.                    |
| `add_place`            | Add a place (POI) to a trip, optionally assigning it to a day.           |
| `add_day`              | Append a new empty day to the end of a trip.                             |
| `insert_day`           | Insert a new empty day immediately after a given day.                    |
| `remove_day`           | Delete a day; its places become unassigned (kept in the trip).          |
| `assign_place_to_day`  | Move a place to a day at a position, or unassign it (dayId null).        |
| `set_night`            | Set (or replace) the overnight stop for a day.                           |
| `optimize_day`         | Reorder a day's middle stops to minimize travel, keeping ends fixed.     |
| `build_route`          | Compute per-day driving time/distance, totals, and any failed days.      |

## Example prompts

- "Using the roadtrip tools, plan a 7-day Copenhagen→Nordkapp trip focused on
  UNESCO sites and nature, ~6h driving/day: create the trip, search and add real
  places, assign them to days, set overnight stops, then build_route and
  rebalance if any day exceeds 7h."
- "List my trips, open the most recent one, and for each day that exceeds 6 hours
  of driving, move or drop a stop and rebuild the route until every day is under
  6h."
- "Create a 3-day weekend trip from Berlin, add three highly-rated food and
  culture stops per day near the route, set sensible overnight cities, then
  optimize each day and show me the total drive time."
