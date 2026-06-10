import { test, expect, describe } from "bun:test";
import { clampWidth } from "@/lib/ui/clamp";

describe("clampWidth", () => {
  test("clamps below min, above max, and passes through in-range", () => {
    expect(clampWidth(100, 280, 720)).toBe(280);
    expect(clampWidth(900, 280, 720)).toBe(720);
    expect(clampWidth(400, 280, 720)).toBe(400);
    expect(clampWidth(280, 280, 720)).toBe(280);
    expect(clampWidth(720, 280, 720)).toBe(720);
  });
});
