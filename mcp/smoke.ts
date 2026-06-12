// Smoke harness for the road-trip MCP server.
//
// Spawns mcp/server.ts over stdio with the SDK client, lists its tools, and
// exercises list_trips (+ create_trip if a Google Maps key is available).
// stdout is free here — this is a client process — but diagnostics use
// console.error to keep the convention consistent with the server.

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const EXPECTED_TOOLS = [
  "list_trips",
  "get_trip",
  "create_trip",
  "search_places",
  "search_places_nearby",
  "geocode",
  "add_place",
  "add_day",
  "insert_day",
  "remove_day",
  "assign_place_to_day",
  "set_night",
  "optimize_day",
  "build_route",
] as const;

function textOf(result: unknown) {
  const content = (result as { content?: Array<{ type: string; text?: string }> })
    .content;
  return (content ?? [])
    .filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("\n");
}

async function main() {
  // AUTH_SECRET is imported transitively by the server (lib/db → session).
  // Forward whatever the parent has, or fall back to a throwaway ≥32-char value.
  const authSecret =
    process.env.AUTH_SECRET && process.env.AUTH_SECRET.length >= 32
      ? process.env.AUTH_SECRET
      : "smoke-test-auth-secret-0123456789-abcdef";

  const transport = new StdioClientTransport({
    command: "bun",
    args: ["mcp/server.ts"],
    env: {
      ...process.env,
      DATABASE_URL: "file:./test.db",
      MCP_OWNER_EMAIL: "smoke@example.com",
      AUTH_SECRET: authSecret,
    },
  });

  const client = new Client({ name: "roadtrip-smoke", version: "1.0.0" });
  await client.connect(transport);

  // 1) Tools
  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name).sort();
  console.error(`Tools (${names.length}):`, names.join(", "));

  const missing = EXPECTED_TOOLS.filter((t) => !names.includes(t));
  if (missing.length > 0) {
    throw new Error(`Missing expected tools: ${missing.join(", ")}`);
  }
  console.error("All expected tools present.");

  // 2) list_trips on a fresh test.db
  const beforeRes = await client.callTool({ name: "list_trips", arguments: {} });
  console.error("list_trips:", textOf(beforeRes));

  // 3) create_trip — hits the real geocode API, so only run with a key.
  if (process.env.GOOGLE_MAPS_SERVER_KEY) {
    const createRes = await client.callTool({
      name: "create_trip",
      arguments: {
        title: "Smoke Trip",
        startName: "Copenhagen, Denmark",
        dayCount: 2,
      },
    });
    console.error("create_trip:", textOf(createRes));

    const afterRes = await client.callTool({ name: "list_trips", arguments: {} });
    console.error("list_trips (after create):", textOf(afterRes));
  } else {
    console.error("create_trip: skipped (no GOOGLE_MAPS_SERVER_KEY)");
  }

  await client.close();
  await transport.close();
  console.error("Smoke OK.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
