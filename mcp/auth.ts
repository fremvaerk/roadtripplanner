import { createHash, timingSafeEqual } from "node:crypto";
import { resolveOwnerSession } from "./owner";
import type { Session } from "@/lib/auth/session";

/** Constant-time bearer check. Fail-closed: false when no token is configured. */
export function checkBearer(authHeader: string | null, token: string | undefined): boolean {
  if (!token) return false; // endpoint disabled until MCP_AUTH_TOKEN is set
  const m = /^Bearer\s+(.+)$/i.exec(authHeader ?? "");
  if (!m) return false;
  // sha256 both sides so timingSafeEqual gets equal-length buffers (no length leak).
  const a = createHash("sha256").update(m[1]).digest();
  const b = createHash("sha256").update(token).digest();
  return timingSafeEqual(a, b);
}

/**
 * The auth seam for the HTTP MCP endpoint. Today: static bearer token.
 * Later (OAuth 2.1): validate the access token and resolve the real per-user
 * session here — callers (the route) stay unchanged.
 */
export async function authenticateMcp(request: Request): Promise<Session | null> {
  if (!checkBearer(request.headers.get("authorization"), process.env.MCP_AUTH_TOKEN)) return null;
  return resolveOwnerSession();
}

/** RFC6750-style 401. Forward-compatible with OAuth (which will add resource_metadata=). */
export function mcpUnauthorized(): Response {
  return new Response(JSON.stringify({ error: "unauthorized" }), {
    status: 401,
    headers: {
      "Content-Type": "application/json",
      "WWW-Authenticate": 'Bearer realm="roadtrip-mcp"',
    },
  });
}
