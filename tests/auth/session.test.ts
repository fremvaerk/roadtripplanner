import { describe, expect, it } from "bun:test";
import { SignJWT } from "jose";

process.env.AUTH_SECRET = "test-secret-at-least-32-bytes-long-xx";

import { readSessionToken, signSession, type Session } from "@/lib/auth/session";

const session: Session = {
  userId: "user-123",
  email: "a@x.com",
  name: "Alice",
  image: "http://img",
};

describe("session sign/read", () => {
  it("roundtrips a session", async () => {
    const token = await signSession(session);
    const read = await readSessionToken(token);
    expect(read).toEqual(session);
  });

  it("returns null for a tampered token", async () => {
    const token = await signSession(session);
    const mid = Math.floor(token.length / 2);
    const flipped = token[mid] === "a" ? "b" : "a";
    const tampered = token.slice(0, mid) + flipped + token.slice(mid + 1);
    expect(await readSessionToken(tampered)).toBeNull();
  });

  it("returns null for a token signed with a different secret", async () => {
    const otherSecret = new TextEncoder().encode("another-secret-at-least-32-bytes-long");
    const token = await new SignJWT({ email: "a@x.com" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("u")
      .setIssuedAt()
      .setExpirationTime("30d")
      .sign(otherSecret);
    expect(await readSessionToken(token)).toBeNull();
  });

  it("returns null for non-JWT garbage", async () => {
    expect(await readSessionToken("not-a-jwt-at-all")).toBeNull();
  });

  it("returns null for an expired token", async () => {
    const secret = new TextEncoder().encode(process.env.AUTH_SECRET ?? "");
    const token = await new SignJWT({ email: "a@x.com" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("u")
      .setExpirationTime(Math.floor(Date.now() / 1000) - 10)
      .sign(secret);
    expect(await readSessionToken(token)).toBeNull();
  });
});
