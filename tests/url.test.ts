import { test, expect, describe } from "bun:test";
import { safeHttpUrl } from "@/lib/url";

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
