import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { isAllowedEmail } from "@/lib/auth/allowlist";
import { getClient, parseRedirectUris, createAuthCode } from "@/lib/oauth/store";
import { isValidChallenge } from "@/lib/oauth/pkce";

export const dynamic = "force-dynamic";

/** Append params to a (possibly custom-scheme) redirect URI. */
function redirectBack(redirectUri: string, params: Record<string, string>): NextResponse {
  const url = new URL(redirectUri);
  for (const [k, v] of Object.entries(params)) if (v) url.searchParams.set(k, v);
  return NextResponse.redirect(url.toString(), { status: 303 });
}

// Handles the consent form. The session cookie is SameSite=Lax, so a cross-site
// auto-submit POST won't carry it → no session → rejected (CSRF protection).
export async function POST(req: Request) {
  const form = await req.formData();
  const clientId = String(form.get("client_id") ?? "");
  const redirectUri = String(form.get("redirect_uri") ?? "");
  const codeChallenge = String(form.get("code_challenge") ?? "");
  const state = String(form.get("state") ?? "");
  const scope = String(form.get("scope") ?? "") || null;
  const resource = String(form.get("resource") ?? "") || null;
  const decision = String(form.get("decision") ?? "");

  // Re-validate client + redirect_uri before redirecting anywhere.
  const client = clientId ? await getClient(clientId) : null;
  if (!client || !redirectUri || !parseRedirectUris(client).includes(redirectUri)) {
    return new NextResponse("Invalid client or redirect_uri", { status: 400 });
  }
  if (!isValidChallenge(codeChallenge)) {
    return redirectBack(redirectUri, { error: "invalid_request", state });
  }

  const session = await getSession();
  if (!session || !isAllowedEmail(session.email)) {
    return redirectBack(redirectUri, { error: "access_denied", state });
  }
  if (decision !== "allow") {
    return redirectBack(redirectUri, { error: "access_denied", state });
  }

  const code = await createAuthCode({
    clientId: client.id,
    userId: session.userId,
    redirectUri,
    codeChallenge,
    scope,
    resource,
  });
  return redirectBack(redirectUri, { code, state });
}
