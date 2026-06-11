import { test, expect, describe } from "bun:test";
import { slugify } from "@/lib/export/download";

describe("slugify", () => {
  test("lowercases and dashes non-alphanumerics", () => {
    expect(slugify("Nordkapp Road Trip 2026")).toBe("nordkapp-road-trip-2026");
  });
  test("collapses runs and trims edge dashes", () => {
    expect(slugify("  —My  Trip!! ")).toBe("my-trip");
  });
  test("falls back to 'trip' for empty/symbol-only input", () => {
    expect(slugify("")).toBe("trip");
    expect(slugify("!!!")).toBe("trip");
  });
});
