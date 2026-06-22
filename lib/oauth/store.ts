import { prisma } from "@/lib/db";
import { sha256, randomToken } from "./tokens";

const AUTH_CODE_TTL_MS = 60_000; // 1 minute (single-use)
const REFRESH_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

export async function getClient(clientId: string) {
  if (!clientId) return null;
  return prisma.oAuthClient.findUnique({ where: { id: clientId } });
}

export function parseRedirectUris(client: { redirectUris: string }): string[] {
  try {
    const a = JSON.parse(client.redirectUris);
    return Array.isArray(a) ? a.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** Mint a single-use authorization code, returning the plaintext code. */
export async function createAuthCode(data: {
  clientId: string;
  userId: string;
  redirectUri: string;
  codeChallenge: string;
  scope: string | null;
  resource: string | null;
}): Promise<string> {
  const code = randomToken();
  await prisma.oAuthAuthCode.create({
    data: {
      codeHash: sha256(code),
      clientId: data.clientId,
      userId: data.userId,
      redirectUri: data.redirectUri,
      codeChallenge: data.codeChallenge,
      scope: data.scope,
      resource: data.resource,
      expiresAt: new Date(Date.now() + AUTH_CODE_TTL_MS),
    },
  });
  return code;
}

/**
 * Look up and immediately delete an authorization code (single-use). Returns the
 * record only if it existed and hasn't expired; null otherwise.
 */
export async function consumeAuthCode(code: string) {
  const rec = await prisma.oAuthAuthCode.findUnique({ where: { codeHash: sha256(code) } });
  if (!rec) return null;
  await prisma.oAuthAuthCode.delete({ where: { id: rec.id } });
  if (rec.expiresAt.getTime() < Date.now()) return null;
  return rec;
}

/** Mint a refresh token, returning the plaintext token. */
export async function createRefreshToken(data: {
  clientId: string;
  userId: string;
  scope: string | null;
  resource: string | null;
}): Promise<string> {
  const token = randomToken();
  await prisma.oAuthRefreshToken.create({
    data: {
      tokenHash: sha256(token),
      clientId: data.clientId,
      userId: data.userId,
      scope: data.scope,
      resource: data.resource,
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
    },
  });
  return token;
}

/**
 * Validate a refresh token and rotate it: the old token is revoked and a new one
 * issued. Returns the new plaintext token + the bound identity, or null if the
 * presented token is unknown/expired/revoked.
 */
export async function rotateRefreshToken(
  token: string,
  clientId: string,
): Promise<{ refreshToken: string; userId: string; scope: string | null; resource: string | null } | null> {
  const rec = await prisma.oAuthRefreshToken.findUnique({ where: { tokenHash: sha256(token) } });
  if (!rec || rec.clientId !== clientId) return null;
  if (rec.revokedAt || rec.expiresAt.getTime() < Date.now()) return null;

  const next = randomToken();
  await prisma.$transaction([
    prisma.oAuthRefreshToken.update({ where: { id: rec.id }, data: { revokedAt: new Date() } }),
    prisma.oAuthRefreshToken.create({
      data: {
        tokenHash: sha256(next),
        clientId: rec.clientId,
        userId: rec.userId,
        scope: rec.scope,
        resource: rec.resource,
        expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
      },
    }),
  ]);
  return { refreshToken: next, userId: rec.userId, scope: rec.scope, resource: rec.resource };
}
