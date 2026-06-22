import { SignJWT, jwtVerify } from "jose";
import { createHash, randomBytes } from "node:crypto";

/** Access-token lifetime. Short — clients refresh with the refresh token. */
export const ACCESS_TTL_SECONDS = 3600;

const secret = () => {
  // Same fail-loud rule as the session signer: an empty/short key lets anyone
  // forge tokens (HMAC accepts a 0-byte key).
  const raw = process.env.AUTH_SECRET;
  if (!raw || raw.length < 32) {
    throw new Error("AUTH_SECRET must be set and at least 32 characters");
  }
  return new TextEncoder().encode(raw);
};

/** URL-safe random token (codes, refresh tokens). */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** Hash secrets at rest so a DB leak doesn't expose live codes/refresh tokens. */
export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * Sign a stateless MCP access token. Bound to the resource (aud) and issuer so a
 * session cookie can never be replayed here and vice versa (token_use marker).
 */
export async function signAccessToken(opts: {
  userId: string;
  email: string;
  clientId: string;
  scope: string;
  issuer: string;
  resource: string;
}): Promise<{ token: string; expiresIn: number }> {
  const token = await new SignJWT({
    email: opts.email,
    scope: opts.scope,
    client_id: opts.clientId,
    token_use: "mcp_access",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(opts.userId)
    .setIssuer(opts.issuer)
    .setAudience(opts.resource)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TTL_SECONDS}s`)
    .sign(secret());
  return { token, expiresIn: ACCESS_TTL_SECONDS };
}

export type AccessClaims = { sub: string; email: string; scope: string; clientId: string };

/** Verify an MCP access token; null on any failure (sig/exp/aud/iss/marker). */
export async function verifyAccessToken(
  token: string,
  opts: { issuer: string; resource: string },
): Promise<AccessClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secret(), {
      issuer: opts.issuer,
      audience: opts.resource,
    });
    if (payload.token_use !== "mcp_access" || !payload.sub || typeof payload.email !== "string") {
      return null;
    }
    return {
      sub: payload.sub,
      email: payload.email,
      scope: typeof payload.scope === "string" ? payload.scope : "",
      clientId: typeof payload.client_id === "string" ? payload.client_id : "",
    };
  } catch {
    return null;
  }
}
