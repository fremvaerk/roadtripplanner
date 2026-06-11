import { describe, expect, it } from "bun:test";
import { isAllowedEmail } from "@/lib/auth/allowlist";

describe("isAllowedEmail", () => {
  describe("open mode (empty/unset list)", () => {
    it.each(["", "   ", ","])("allows any email when raw is %p", (raw) => {
      expect(isAllowedEmail("anyone@example.com", raw)).toBe(true);
    });

    it("defaults to process.env.ALLOWED_EMAILS, open when it is empty", () => {
      // Control the env explicitly so the result doesn't depend on the ambient .env.
      const prev = process.env.ALLOWED_EMAILS;
      try {
        process.env.ALLOWED_EMAILS = "";
        expect(isAllowedEmail("anyone@example.com")).toBe(true);
        process.env.ALLOWED_EMAILS = "owner@x.com";
        expect(isAllowedEmail("owner@x.com")).toBe(true);
        expect(isAllowedEmail("anyone@example.com")).toBe(false);
      } finally {
        if (prev === undefined) delete process.env.ALLOWED_EMAILS;
        else process.env.ALLOWED_EMAILS = prev;
      }
    });
  });

  describe("with an allowlist", () => {
    const list = "a@x.com,b@x.com";

    it("allows listed emails", () => {
      expect(isAllowedEmail("a@x.com", list)).toBe(true);
      expect(isAllowedEmail("b@x.com", list)).toBe(true);
    });

    it("rejects unlisted emails", () => {
      expect(isAllowedEmail("c@x.com", list)).toBe(false);
    });

    it("is case- and whitespace-insensitive", () => {
      expect(isAllowedEmail(" A@X.com ", list)).toBe(true);
    });
  });
});
