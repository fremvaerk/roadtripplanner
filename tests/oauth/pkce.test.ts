import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { verifyPkceS256, isValidChallenge } from "@/lib/oauth/pkce";

const challengeFor = (verifier: string) => createHash("sha256").update(verifier).digest("base64url");

describe("PKCE S256", () => {
  test("accepts a matching verifier", () => {
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    expect(verifyPkceS256(verifier, challengeFor(verifier))).toBe(true);
  });

  test("rejects a non-matching verifier", () => {
    const challenge = challengeFor("the-real-verifier");
    expect(verifyPkceS256("a-different-verifier", challenge)).toBe(false);
  });

  test("rejects empty inputs", () => {
    expect(verifyPkceS256("", "x")).toBe(false);
    expect(verifyPkceS256("x", "")).toBe(false);
  });
});

describe("isValidChallenge", () => {
  test("accepts 43–128 url-safe chars", () => {
    expect(isValidChallenge("a".repeat(43))).toBe(true);
    expect(isValidChallenge(challengeFor("anything"))).toBe(true);
  });
  test("rejects too short / illegal chars", () => {
    expect(isValidChallenge("a".repeat(42))).toBe(false);
    expect(isValidChallenge("has spaces and+slash/")).toBe(false);
  });
});
