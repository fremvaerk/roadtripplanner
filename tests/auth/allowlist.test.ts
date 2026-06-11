import { describe, expect, it } from "bun:test";
import { isAllowedEmail } from "@/lib/auth/allowlist";

describe("isAllowedEmail", () => {
  describe("open mode (empty/unset list)", () => {
    it.each([undefined, "", "   ", ","])("allows any email when raw is %p", (raw) => {
      expect(isAllowedEmail("anyone@example.com", raw)).toBe(true);
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
