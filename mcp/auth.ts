import { createHash, timingSafeEqual } from "node:crypto";
import { resolveOwnerSession } from "./owner";
import { prisma } from "@/lib/db";
import { verifyAccessToken } from "@/lib/oauth/tokens";
import { baseUrl, mcpResource } from "@/lib/oauth/config";
import type { Session } from "@/lib/auth/session";

/** Constant-time bearer check. Fail-closed: false when no token is configured. */
export function checkBearer(authHeader: string | null, token: string | undefined): boolean {
  if (!token) return false; // disabled until MCP_AUTH_TOKEN is set
  const m = /^Bearer\s+(.+)$/i.exec(authHeader ?? "");
  if (!m) return false;
  // sha256 both sides so timingSafeEqual gets equal-length buffers (no length leak).
  const a = createHash("sha256").update(m[1]).digest();
  const b = createHash("sha256").update(token).digest();
  return timingSafeEqual(a, b);
}

/**
 * Auth seam for the HTTP MCP endpoint. Accepts either:
 *   1. an OAuth 2.1 access token (JWT bound to this resource) → that user, or
 *   2. the static MCP_AUTH_TOKEN (stdio/CLI) → the configured owner.
 * The route stays unchanged regardless.
 */
export async function authenticateMcp(request: Request): Promise<Session | null> {
  const header = request.headers.get("authorization");
  const m = /^Bearer\s+(.+)$/i.exec(header ?? "");
  if (!m) return null;
  const presented = m[1];

  // 1. OAuth access token (audience-bound to this MCP resource).
  const claims = await verifyAccessToken(presented, {
    issuer: baseUrl(request),
    resource: mcpResource(request),
  });
  if (claims) {
    const user = await prisma.user.findUnique({
      where: { id: claims.sub },
      select: { id: true, email: true, name: true, image: true },
    });
    return user ? { userId: user.id, email: user.email, name: user.name, image: user.image } : null;
  }

  // 2. Static bearer fallback (the token isn't a valid access JWT).
  if (checkBearer(header, process.env.MCP_AUTH_TOKEN)) return resolveOwnerSession();

  return null;
}

/**
 * RFC 6750 / RFC 9728 401: points clients at the protected-resource metadata so
 * they can discover the Authorization Server and start the OAuth flow.
 */
export function mcpUnauthorized(request?: Request): Response {
  const wwwAuth = request
    ? `Bearer realm="roadtrip-mcp", resource_metadata="${baseUrl(request)}/.well-known/oauth-protected-resource"`
    : 'Bearer realm="roadtrip-mcp"';
  return new Response(JSON.stringify({ error: "unauthorized" }), {
    status: 401,
    headers: { "Content-Type": "application/json", "WWW-Authenticate": wwwAuth },
  });
}
