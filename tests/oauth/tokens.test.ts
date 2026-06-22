process.env.AUTH_SECRET = "test-secret-at-least-32-bytes-long-xx";

import { describe, expect, test } from "bun:test";
import { signAccessToken, verifyAccessToken } from "@/lib/oauth/tokens";
import { signSession } from "@/lib/auth/session";

const ISS = "https://app.example";
const RES = "https://app.example/api/mcp";

async function mint(over: Partial<Parameters<typeof signAccessToken>[0]> = {}) {
  return signAccessToken({
    userId: "u1",
    email: "a@b.com",
    clientId: "c1",
    scope: "mcp",
    issuer: ISS,
    resource: RES,
    ...over,
  });
}

describe("access tokens", () => {
  test("sign/verify roundtrip carries the claims", async () => {
    const { token, expiresIn } = await mint();
    expect(expiresIn).toBeGreaterThan(0);
    const c = await verifyAccessToken(token, { issuer: ISS, resource: RES });
    expect(c).toEqual({ sub: "u1", email: "a@b.com", scope: "mcp", clientId: "c1" });
  });

  test("rejects a wrong audience (resource)", async () => {
    const { token } = await mint();
    expect(await verifyAccessToken(token, { issuer: ISS, resource: "https://app.example/other" })).toBeNull();
  });

  test("rejects a wrong issuer", async () => {
    const { token } = await mint();
    expect(await verifyAccessToken(token, { issuer: "https://evil.example", resource: RES })).toBeNull();
  });

  test("rejects a tampered token", async () => {
    const { token } = await mint();
    expect(await verifyAccessToken(token + "x", { issuer: ISS, resource: RES })).toBeNull();
  });

  test("a session cookie JWT cannot be used as an access token", async () => {
    const sessionJwt = await signSession({ userId: "u1", email: "a@b.com" });
    expect(await verifyAccessToken(sessionJwt, { issuer: ISS, resource: RES })).toBeNull();
  });
});
