# MCP Server → HTTP transport (Path A: bearer auth)

**Goal:** Make the MCP server reachable over HTTP for deployment, mounted in the Next app at `app/api/mcp/route.ts` (shares the SQLite-on-a-volume DB + env + guards). Gate it with a **static bearer token** behind a single `authenticate(request)` seam so a future OAuth 2.1 upgrade is localized. Keep the existing stdio entry for local dev by sharing tool registration.

**Architecture decided** (from SDK inspection):
- Transport: `WebStandardStreamableHTTPServerTransport` (Fetch `Request`/`Response`), **stateless** (`sessionIdGenerator: undefined`) + `enableJsonResponse: true`.
- Per request: authenticate → build a fresh `McpServer` + fresh transport → `handleRequest(req)` → return the `Response`. (SDK requires a fresh transport per request in stateless mode; the `Server` class has no "initialize-first" gate, so per-request servers answer `tools/*` directly.)
- Single owner unchanged (`MCP_OWNER_EMAIL`/`ALLOWED_EMAILS`); the bearer token just gates access and the seam returns the owner session.

> Workers: Bun + Next 16 App Router. Don't run prettier. Stage only your files. `@/*` maps to repo root.

---

### Task 1 — Extract shared modules (refactor; behavior-preserving)

Split `mcp/server.ts` so both stdio and HTTP reuse the tools. Create:

- **`mcp/owner.ts`** — `export function resolveOwnerSession(): Promise<Session>`, memoized in a module-level `let cached: Promise<Session> | null`. Body = the current owner-resolution + `prisma.user.upsert` from `main()`, returning `{ userId, email }`. On empty email **throw** `new Error("Set MCP_OWNER_EMAIL or ALLOWED_EMAILS")` (don't `process.exit` — this now runs inside a web server too).
- **`mcp/tools.ts`** — move the `ok`/`fail`/`run` helpers and ALL imports for operations/service/geocode/search/guards/routing here. Export `export function buildMcpServer(session: Session): McpServer` that does `const server = new McpServer({ name: "roadtrip", version: "1.0.0" })`, registers all 14 tools verbatim (they close over `session` + `prisma`), and `return server`. No stdout writes.
- **`mcp/server.ts`** — slim stdio entry: `import { resolveOwnerSession } from "./owner"; import { buildMcpServer } from "./tools"; import { StdioServerTransport } ...`. `main()`: `const session = await resolveOwnerSession(); const server = buildMcpServer(session); await server.connect(new StdioServerTransport()); console.error(...ready...)`. Keep the stdout-hygiene header comment.

**Verify:** `bun run build` green; the existing `bun mcp/smoke.ts` (stdio) still lists 14 tools + list_trips works (run with `DATABASE_URL="file:./test.db"`). Commit: `refactor(mcp): extract owner + tool registration for transport reuse`.

---

### Task 2 — HTTP route + bearer auth (the security-critical part)

- **`mcp/auth.ts`**:
  - `export function checkBearer(authHeader: string | null, token: string | undefined): boolean` — **pure**, unit-testable. Returns false if `token` is falsy (fail-closed) or header missing/not `Bearer `. Compares with a constant-time hash compare: `import { createHash, timingSafeEqual } from "node:crypto"`; hash both presented secret and `token` with sha256 → `timingSafeEqual`. (Hashing equalizes length so no length leak and `timingSafeEqual` won't throw.)
  - `export async function authenticateMcp(request: Request): Promise<Session | null>` — `if (!checkBearer(request.headers.get("authorization"), process.env.MCP_AUTH_TOKEN)) return null;` then `return resolveOwnerSession();`. This is the OAuth-swap seam.
  - `export function mcpUnauthorized(): Response` — `401` JSON `{ error: "unauthorized" }` with header `WWW-Authenticate: Bearer realm="roadtrip-mcp"` (forward-compatible; OAuth adds `resource_metadata=`).
- **`app/api/mcp/route.ts`**:
  - `export const runtime = "nodejs"; export const dynamic = "force-dynamic";`
  - `async function handlePost(req: Request): Promise<Response>`: `const session = await authenticateMcp(req); if (!session) return mcpUnauthorized();` then
    ```ts
    const server = buildMcpServer(session);
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    await server.connect(transport);
    return transport.handleRequest(req);
    ```
  - `export const POST = handlePost;`
  - `export async function GET() { return new Response("Method Not Allowed", { status: 405 }); }` and same for `DELETE` (stateless ⇒ no server→client SSE, no sessions to terminate). Still require auth on GET/DELETE before the 405? Not necessary — they carry no data — but cheap to leave unauthenticated 405.
- **`tests/mcp/auth.test.ts`** (bun:test): `checkBearer` — false when token undefined/empty (fail-closed) even with a matching-looking header; false on missing header, wrong scheme, wrong token; true on exact `Bearer <token>`. (Pure, no DB.)

**Verify:** `bun run build` green; `bun run test tests/mcp/auth.test.ts` passes. Commit: `feat(mcp): HTTP route (streamable) with bearer auth seam`.

---

### Task 3 — Config, docs, HTTP smoke

- **`.env.example`**: add `MCP_AUTH_TOKEN=""` with a comment: required to enable the HTTP endpoint `/api/mcp`; if unset the endpoint rejects all requests (fail-closed). Note `MCP_OWNER_EMAIL` still selects the acting user.
- **`docs/mcp.md`**: add an **HTTP / deployed** section: endpoint `POST /api/mcp`, bearer auth, the remote MCP client config (Claude Code/Desktop):
  ```json
  { "mcpServers": { "roadtrip": { "type": "http", "url": "https://<host>/api/mcp", "headers": { "Authorization": "Bearer <MCP_AUTH_TOKEN>" } } } }
  ```
  Keep the existing stdio section for local dev (note `.mcp.json` stays stdio locally). Add a short "Auth: bearer now, OAuth 2.1 later" note pointing at the `authenticateMcp` seam.
- **`mcp/smoke-http.ts`**: import the route handlers directly (`import { POST } from "@/app/api/mcp/route"`), and drive them with crafted `Request`s (no network):
  1. POST without auth → assert `401`.
  2. With `Authorization: Bearer <token>` and headers `Content-Type: application/json`, `Accept: application/json, text/event-stream`, body = a JSON-RPC `initialize` request → assert `200` and a result with `serverInfo`.
  3. Same auth, body = `tools/list` → assert the 14 tool names present.
  Set `process.env.MCP_AUTH_TOKEN` + `MCP_OWNER_EMAIL` + `DATABASE_URL=file:./test.db` at the top of the smoke before importing the route (or via the run command). Print PASS/FAIL per step; `process.exit(1)` on any failure.

**Verify:** `MCP_AUTH_TOKEN=test-secret MCP_OWNER_EMAIL=smoke@example.com DATABASE_URL="file:./test.db" bun mcp/smoke-http.ts` → 401 then 200 + tool list. `bun run build` green. Commit: `feat(mcp): bearer env, docs, and HTTP smoke harness`.

---

### Task 4 — Review + merge

Review `git diff main...HEAD`: fail-closed auth (no token ⇒ 401), constant-time compare, no stdout writes in tools.ts (still stdio-safe), route runtime=nodejs, per-request fresh transport, owner seam returns owner session, stdio entry still works. Then `superpowers:finishing-a-development-branch` → merge `--no-ff`, delete branch. Update the `mcp-server` memory (now HTTP + bearer; OAuth 2.1 is the planned next step).
