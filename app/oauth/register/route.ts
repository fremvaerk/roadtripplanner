import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const CORS = { "Access-Control-Allow-Origin": "*" };

function isValidRedirectUri(u: unknown): u is string {
  if (typeof u !== "string" || !u) return false;
  try {
    new URL(u); // any absolute URI with a scheme (https, http://localhost, custom://…)
    return true;
  } catch {
    return false;
  }
}

// RFC 7591 — Dynamic Client Registration. MCP clients (e.g. Claude) self-register
// as public clients; security comes from exact redirect_uri matching + PKCE, not
// a client secret.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const redirectUris = (body as { redirect_uris?: unknown })?.redirect_uris;
  if (!Array.isArray(redirectUris) || redirectUris.length === 0 || !redirectUris.every(isValidRedirectUri)) {
    return NextResponse.json(
      { error: "invalid_redirect_uri", error_description: "redirect_uris must be a non-empty array of absolute URIs" },
      { status: 400, headers: CORS },
    );
  }
  const name = typeof (body as { client_name?: unknown }).client_name === "string"
    ? ((body as { client_name?: string }).client_name as string).slice(0, 200)
    : null;

  const client = await prisma.oAuthClient.create({
    data: { name, redirectUris: JSON.stringify(redirectUris) },
  });

  return NextResponse.json(
    {
      client_id: client.id,
      client_id_issued_at: Math.floor(client.createdAt.getTime() / 1000),
      client_name: client.name ?? undefined,
      redirect_uris: redirectUris,
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    },
    { status: 201, headers: CORS },
  );
}

export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      ...CORS,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
