import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { baseUrl, mcpResource, DEFAULT_SCOPE } from "@/lib/oauth/config";
import { getClient, consumeAuthCode, createRefreshToken, rotateRefreshToken } from "@/lib/oauth/store";
import { verifyPkceS256 } from "@/lib/oauth/pkce";
import { signAccessToken } from "@/lib/oauth/tokens";

export const dynamic = "force-dynamic";

const CORS = { "Access-Control-Allow-Origin": "*" } as const;
const NO_STORE = { "Cache-Control": "no-store", Pragma: "no-cache" } as const;

function oauthError(error: string, description?: string, status = 400) {
  return NextResponse.json(
    { error, ...(description ? { error_description: description } : {}) },
    { status, headers: { ...CORS, ...NO_STORE } },
  );
}

async function issue(req: Request, opts: { userId: string; email: string; clientId: string; scope: string; refreshToken: string }) {
  const { token, expiresIn } = await signAccessToken({
    userId: opts.userId,
    email: opts.email,
    clientId: opts.clientId,
    scope: opts.scope,
    issuer: baseUrl(req),
    resource: mcpResource(req),
  });
  return NextResponse.json(
    {
      access_token: token,
      token_type: "Bearer",
      expires_in: expiresIn,
      refresh_token: opts.refreshToken,
      scope: opts.scope,
    },
    { headers: { ...CORS, ...NO_STORE } },
  );
}

export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  if (!form) return oauthError("invalid_request", "Expected form-encoded body");

  const grantType = String(form.get("grant_type") ?? "");
  const clientId = String(form.get("client_id") ?? "");
  const client = clientId ? await getClient(clientId) : null;
  if (!client) return oauthError("invalid_client", "Unknown client_id");

  if (grantType === "authorization_code") {
    const code = String(form.get("code") ?? "");
    const redirectUri = String(form.get("redirect_uri") ?? "");
    const codeVerifier = String(form.get("code_verifier") ?? "");

    const rec = await consumeAuthCode(code); // single-use: deleted on read
    if (!rec || rec.clientId !== client.id || rec.redirectUri !== redirectUri) {
      return oauthError("invalid_grant", "Invalid or expired authorization code");
    }
    if (!verifyPkceS256(codeVerifier, rec.codeChallenge)) {
      return oauthError("invalid_grant", "PKCE verification failed");
    }
    const user = await prisma.user.findUnique({ where: { id: rec.userId }, select: { id: true, email: true } });
    if (!user) return oauthError("invalid_grant", "User no longer exists");

    const scope = rec.scope ?? DEFAULT_SCOPE;
    const refreshToken = await createRefreshToken({ clientId: client.id, userId: user.id, scope, resource: rec.resource });
    return issue(req, { userId: user.id, email: user.email, clientId: client.id, scope, refreshToken });
  }

  if (grantType === "refresh_token") {
    const presented = String(form.get("refresh_token") ?? "");
    const rotated = await rotateRefreshToken(presented, client.id);
    if (!rotated) return oauthError("invalid_grant", "Invalid or expired refresh token");
    const user = await prisma.user.findUnique({ where: { id: rotated.userId }, select: { id: true, email: true } });
    if (!user) return oauthError("invalid_grant", "User no longer exists");

    const scope = rotated.scope ?? DEFAULT_SCOPE;
    return issue(req, { userId: user.id, email: user.email, clientId: client.id, scope, refreshToken: rotated.refreshToken });
  }

  return oauthError("unsupported_grant_type", `Unsupported grant_type: ${grantType}`);
}

export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: { ...CORS, "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" },
  });
}
