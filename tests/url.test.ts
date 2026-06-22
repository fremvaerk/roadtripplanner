import { test, expect, describe } from "bun:test";
import { safeHttpUrl, safeLocalPath } from "@/lib/url";

describe("safeLocalPath", () => {
  test("accepts plain local paths", () => {
    expect(safeLocalPath("/")).toBe("/");
    expect(safeLocalPath("/oauth/authorize?x=1")).toBe("/oauth/authorize?x=1");
  });
  test("rejects open-redirect forms", () => {
    expect(safeLocalPath("//evil.com")).toBeNull(); // protocol-relative
    expect(safeLocalPath("/\\evil.com")).toBeNull(); // backslash
    expect(safeLocalPath("https://evil.com")).toBeNull();
    expect(safeLocalPath("evil.com")).toBeNull();
    expect(safeLocalPath(null)).toBeNull();
    expect(safeLocalPath("")).toBeNull();
  });
});

describe("safeHttpUrl", () => {
  test("allows http/https", () => {
    expect(safeHttpUrl("https://booking.com/x")).toBe("https://booking.com/x");
    expect(safeHttpUrl("http://a.test")).toBe("http://a.test/");
  });
  test("blocks dangerous schemes", () => {
    expect(safeHttpUrl("javascript:alert(1)")).toBeNull();
    expect(safeHttpUrl("data:text/html,<script>")).toBeNull();
    expect(safeHttpUrl("vbscript:msgbox")).toBeNull();
  });
  test("null/empty/garbage → null", () => {
    expect(safeHttpUrl(null)).toBeNull();
    expect(safeHttpUrl("  ")).toBeNull();
    expect(safeHttpUrl("not a url")).toBeNull();
  });
});
