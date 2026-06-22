// OAuth 2.1 Authorization Server config for the MCP resource.
//
// The app is both the Authorization Server and the Resource Server. User
// identity comes from the existing Google login; see lib/oauth/* + app/oauth/*.

/** The MCP resource lives here; access tokens are audience-bound to it. */
export const MCP_RESOURCE_PATH = "/mcp";

/** Scopes we issue. Kept minimal — one scope granting MCP tool access. */
export const SCOPES_SUPPORTED = ["mcp"] as const;
export const DEFAULT_SCOPE = "mcp";

/** Public origin of this deployment. Prefer APP_URL; fall back to the request. */
export function baseUrl(req: Request): string {
  return process.env.APP_URL ?? new URL(req.url).origin;
}

/** The canonical resource identifier (RFC 8707 audience) for the MCP endpoint. */
export function mcpResource(req: Request): string {
  return baseUrl(req) + MCP_RESOURCE_PATH;
}
