import { createHash } from "node:crypto";

/**
 * Verify a PKCE S256 challenge: BASE64URL(SHA256(verifier)) === challenge.
 * We only support S256 (OAuth 2.1 forbids "plain").
 */
export function verifyPkceS256(verifier: string, challenge: string): boolean {
  if (!verifier || !challenge) return false;
  const computed = createHash("sha256").update(verifier).digest("base64url");
  return computed === challenge;
}

/** Basic shape check for a code_challenge (43–128 url-safe chars per spec). */
export function isValidChallenge(challenge: string): boolean {
  return /^[A-Za-z0-9._~-]{43,128}$/.test(challenge);
}
