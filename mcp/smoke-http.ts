// In-process smoke for the HTTP MCP endpoint (app/mcp/route.ts).
//
// Drives the route handler directly — no network. Env must be set BEFORE the
// route module is imported, because mcp/auth.ts reads MCP_AUTH_TOKEN and the
// owner is resolved from MCP_OWNER_EMAIL at request time. We use a dynamic
// import after seeding env so module-load reads see the right values.
//
// Run (after syncing schema to test.db):
//   bun run test:db
//   MCP_AUTH_TOKEN=smoke-secret MCP_OWNER_EMAIL=smoke@example.com \
//     DATABASE_URL="file:./test.db" bun mcp/smoke-http.ts

process.env.MCP_AUTH_TOKEN ||= "smoke-secret";
process.env.MCP_OWNER_EMAIL ||= "smoke@example.com";
process.env.DATABASE_URL ||= "file:./test.db";
// AUTH_SECRET is imported transitively via lib/db → session.
if (!process.env.AUTH_SECRET || process.env.AUTH_SECRET.length < 32) {
  process.env.AUTH_SECRET = "smoke-test-auth-secret-0123456789-abcdef";
}

// `export {}` makes this a module so the top-level await above is allowed.
export {};

const { POST } = await import("@/app/mcp/route");

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

// `token: undefined` would fall through to the default param, so distinguish
// "send no token" via a sentinel. NO_AUTH ⇒ omit the Authorization header.
const NO_AUTH = Symbol("no-auth");

function mcpReq(body: unknown, token: string | undefined | typeof NO_AUTH = process.env.MCP_AUTH_TOKEN) {
  const bearer = token === NO_AUTH ? undefined : token;
  return new Request("http://local/mcp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

/** Parse a JSON-RPC response body that may be plain JSON or an SSE frame. */
function parseRpc(text: string): { parsed: unknown; format: "json" | "sse" } {
  const trimmed = text.trimStart();
  if (trimmed.startsWith("event:") || trimmed.startsWith("data:")) {
    const line = trimmed.split("\n").find((l) => l.startsWith("data:"));
    if (!line) throw new Error(`SSE frame has no data line:\n${text}`);
    return { parsed: JSON.parse(line.slice("data:".length).trim()), format: "sse" };
  }
  return { parsed: JSON.parse(text), format: "json" };
}

let failed = false;
let observedFormat: "json" | "sse" | undefined;

function pass(label: string, detail = "") {
  console.log(`PASS: ${label}${detail ? ` — ${detail}` : ""}`);
}
function fail(label: string, detail = "") {
  failed = true;
  console.log(`FAIL: ${label}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  // 1) 401 when unauthenticated.
  {
    const res = await POST(mcpReq({ jsonrpc: "2.0", id: 1, method: "tools/list" }, NO_AUTH));
    if (res.status === 401) pass("401 unauth", `status=${res.status}`);
    else fail("401 unauth", `expected 401, got ${res.status}: ${await res.text()}`);
  }

  // 2) initialize → 200 with result.serverInfo.
  {
    const res = await POST(
      mcpReq({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "smoke", version: "0" },
        },
      }),
    );
    if (res.status !== 200) {
      fail("initialize", `expected 200, got ${res.status}: ${await res.text()}`);
    } else {
      const { parsed, format } = parseRpc(await res.text());
      observedFormat = format;
      const result = (parsed as { result?: { serverInfo?: { name?: string } } }).result;
      if (result?.serverInfo) {
        pass("initialize", `200, serverInfo.name=${result.serverInfo.name} (${format})`);
      } else {
        fail("initialize", `no result.serverInfo: ${JSON.stringify(parsed)}`);
      }
    }
  }

  // 3) tools/list → 200 with all 14 expected tools.
  {
    const res = await POST(mcpReq({ jsonrpc: "2.0", id: 2, method: "tools/list" }));
    if (res.status !== 200) {
      fail("tools/list", `expected 200, got ${res.status}: ${await res.text()}`);
    } else {
      const { parsed, format } = parseRpc(await res.text());
      observedFormat = format;
      const tools =
        (parsed as { result?: { tools?: Array<{ name: string }> } }).result?.tools ?? [];
      const names = tools.map((t) => t.name);
      const missing = EXPECTED_TOOLS.filter((t) => !names.includes(t));
      if (missing.length === 0) {
        pass("tools/list", `200, ${names.length} tools (${format})`);
      } else {
        fail("tools/list", `missing: ${missing.join(", ")}`);
      }
    }
  }

  if (observedFormat) {
    console.log(`Response format observed: ${observedFormat.toUpperCase()}`);
  }
  if (failed) process.exit(1);
  console.log("Smoke OK.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
