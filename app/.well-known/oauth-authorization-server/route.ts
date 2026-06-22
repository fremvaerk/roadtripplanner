import { NextResponse } from "next/server";
import { baseUrl, SCOPES_SUPPORTED } from "@/lib/oauth/config";

export const dynamic = "force-dynamic";

// RFC 8414 — OAuth 2.0 Authorization Server Metadata. The `issuer` must equal
// the origin this document is served from.
export async function GET(req: Request) {
  const origin = baseUrl(req);
  return NextResponse.json(
    {
      issuer: origin,
      authorization_endpoint: `${origin}/oauth/authorize`,
      token_endpoint: `${origin}/oauth/token`,
      registration_endpoint: `${origin}/oauth/register`,
      scopes_supported: [...SCOPES_SUPPORTED],
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
    },
    { headers: { "Access-Control-Allow-Origin": "*" } },
  );
}

export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "*",
    },
  });
}
