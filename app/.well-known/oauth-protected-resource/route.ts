import { NextResponse } from "next/server";
import { baseUrl, mcpResource, SCOPES_SUPPORTED } from "@/lib/oauth/config";

export const dynamic = "force-dynamic";

// RFC 9728 — OAuth 2.0 Protected Resource Metadata. Lets an MCP client discover
// which Authorization Server protects the MCP endpoint.
export async function GET(req: Request) {
  return NextResponse.json(
    {
      resource: mcpResource(req),
      authorization_servers: [baseUrl(req)],
      scopes_supported: [...SCOPES_SUPPORTED],
      bearer_methods_supported: ["header"],
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
