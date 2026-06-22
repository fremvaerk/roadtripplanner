import { describe, expect, test, beforeEach, afterAll } from "bun:test";
import { prisma } from "@/lib/db";
import {
  createAuthCode,
  consumeAuthCode,
  createRefreshToken,
  rotateRefreshToken,
  parseRedirectUris,
} from "@/lib/oauth/store";

let clientId = "";
let userId = "";

beforeEach(async () => {
  await prisma.oAuthRefreshToken.deleteMany();
  await prisma.oAuthAuthCode.deleteMany();
  await prisma.oAuthClient.deleteMany();
  await prisma.user.deleteMany();
  const user = await prisma.user.create({ data: { email: "owner@example.com" } });
  userId = user.id;
  const client = await prisma.oAuthClient.create({
    data: { name: "Test", redirectUris: JSON.stringify(["https://c.example/cb"]) },
  });
  clientId = client.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

const codeData = () => ({
  clientId,
  userId,
  redirectUri: "https://c.example/cb",
  codeChallenge: "challenge",
  scope: "mcp",
  resource: null,
});

describe("auth codes", () => {
  test("are single-use", async () => {
    const code = await createAuthCode(codeData());
    const first = await consumeAuthCode(code);
    expect(first?.userId).toBe(userId);
    expect(await consumeAuthCode(code)).toBeNull(); // already consumed
  });

  test("a bogus code returns null", async () => {
    expect(await consumeAuthCode("nope")).toBeNull();
  });

  test("an expired code returns null", async () => {
    const code = await createAuthCode(codeData());
    await prisma.oAuthAuthCode.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await consumeAuthCode(code)).toBeNull();
  });
});

describe("refresh tokens", () => {
  test("rotate: old is revoked, new works", async () => {
    const t0 = await createRefreshToken({ clientId, userId, scope: "mcp", resource: null });
    const r1 = await rotateRefreshToken(t0, clientId);
    expect(r1?.userId).toBe(userId);
    // old token is now revoked
    expect(await rotateRefreshToken(t0, clientId)).toBeNull();
    // the freshly issued token rotates again
    const r2 = await rotateRefreshToken(r1!.refreshToken, clientId);
    expect(r2?.userId).toBe(userId);
  });

  test("rejects a token presented with the wrong client", async () => {
    const t = await createRefreshToken({ clientId, userId, scope: "mcp", resource: null });
    expect(await rotateRefreshToken(t, "some-other-client")).toBeNull();
  });
});

describe("parseRedirectUris", () => {
  test("parses a JSON array, tolerates junk", () => {
    expect(parseRedirectUris({ redirectUris: '["https://a","https://b"]' })).toEqual(["https://a", "https://b"]);
    expect(parseRedirectUris({ redirectUris: "not json" })).toEqual([]);
  });
});
