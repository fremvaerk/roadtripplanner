import { describe, expect, it } from "bun:test";
import { validateIdTokenClaims } from "@/lib/auth/oidc";

const base = {
  aud: "cid",
  iss: "https://accounts.google.com",
  nonce: "n",
  email_verified: true,
  email: "a@x.com",
  name: "A",
  picture: "http://p",
};
const opts = { clientId: "cid", nonce: "n" };

describe("validateIdTokenClaims", () => {
  it("returns claims for a valid payload", () => {
    expect(validateIdTokenClaims({ ...base }, opts)).toEqual({
      email: "a@x.com",
      name: "A",
      picture: "http://p",
    });
  });

  it("accepts iss without https", () => {
    expect(validateIdTokenClaims({ ...base, iss: "accounts.google.com" }, opts).email).toBe("a@x.com");
  });

  it("throws on wrong aud", () => {
    expect(() => validateIdTokenClaims({ ...base, aud: "other" }, opts)).toThrow("bad aud");
  });

  it("throws on disallowed iss", () => {
    expect(() => validateIdTokenClaims({ ...base, iss: "https://evil.com" }, opts)).toThrow("bad iss");
  });

  it("throws on nonce mismatch", () => {
    expect(() => validateIdTokenClaims({ ...base, nonce: "wrong" }, opts)).toThrow("bad nonce");
  });

  it("throws when email is not verified", () => {
    expect(() => validateIdTokenClaims({ ...base, email_verified: false }, opts)).toThrow("email not verified");
  });

  it("throws when email is missing", () => {
    const { email: _email, ...noEmail } = base;
    expect(() => validateIdTokenClaims({ ...noEmail }, opts)).toThrow("no email");
  });
});
