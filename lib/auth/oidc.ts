import { jwtVerify, createRemoteJWKSet } from "jose";

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const JWKS_URI = "https://www.googleapis.com/oauth2/v3/certs";
const ISSUERS = ["accounts.google.com", "https://accounts.google.com"];

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} must be set`);
  return v;
}
const clientId = () => required("GOOGLE_CLIENT_ID");
const clientSecret = () => required("GOOGLE_CLIENT_SECRET");
const redirectUri = () => `${process.env.APP_URL ?? ""}/api/auth/callback`;

export function buildAuthUrl({ state, nonce }: { state: string; nonce: string }): string {
  const p = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: "openid email profile",
    state,
    nonce,
    prompt: "select_account",
    access_type: "online",
  });
  return `${AUTH_ENDPOINT}?${p.toString()}`;
}

export async function exchangeCode(code: string): Promise<{ id_token: string; access_token?: string }> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId(),
      client_secret: clientSecret(),
      redirect_uri: redirectUri(),
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`token exchange failed (${res.status})`);
  return res.json();
}

export type IdClaims = { email: string; name: string | null; picture: string | null };

/** Pure validation of the decoded id_token payload. Throws on any mismatch. */
export function validateIdTokenClaims(
  payload: Record<string, unknown>,
  opts: { clientId: string; nonce: string },
): IdClaims {
  if (payload.aud !== opts.clientId) throw new Error("bad aud");
  if (!ISSUERS.includes(String(payload.iss))) throw new Error("bad iss");
  if (payload.nonce !== opts.nonce) throw new Error("bad nonce");
  if (payload.email_verified !== true) throw new Error("email not verified");
  if (typeof payload.email !== "string") throw new Error("no email");
  return {
    email: payload.email,
    name: (payload.name as string) ?? null,
    picture: (payload.picture as string) ?? null,
  };
}

const jwks = createRemoteJWKSet(new URL(JWKS_URI));

export async function verifyIdToken(idToken: string, { nonce }: { nonce: string }): Promise<IdClaims> {
  const { payload } = await jwtVerify(idToken, jwks, { audience: clientId(), issuer: ISSUERS });
  return validateIdTokenClaims(payload as Record<string, unknown>, { clientId: clientId(), nonce });
}
