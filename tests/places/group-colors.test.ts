import { test, expect, describe } from "bun:test";
import {
  PALETTE,
  UNGROUPED_COLOR,
  defaultGroupColor,
  darken,
  isValidHexColor,
} from "@/lib/places/group-colors";

describe("group-colors", () => {
  test("PALETTE entries and UNGROUPED_COLOR are valid 6-digit hex", () => {
    expect(PALETTE.length).toBeGreaterThanOrEqual(6);
    for (const c of PALETTE) expect(isValidHexColor(c)).toBe(true);
    expect(isValidHexColor(UNGROUPED_COLOR)).toBe(true);
  });

  test("defaultGroupColor wraps with modulo and is stable", () => {
    expect(defaultGroupColor(0)).toBe(PALETTE[0]);
    expect(defaultGroupColor(1)).toBe(PALETTE[1]);
    expect(defaultGroupColor(PALETTE.length)).toBe(PALETTE[0]);
    expect(defaultGroupColor(-1)).toBe(PALETTE[PALETTE.length - 1]);
  });

  test("darken returns a valid, darker 6-digit hex and clamps at 0", () => {
    expect(darken("#ffffff", 0.5)).toBe("#7f7f7f");
    expect(darken("#000000", 0.2)).toBe("#000000");
    expect(isValidHexColor(darken("#3b82f6"))).toBe(true);
  });

  test("isValidHexColor accepts #rrggbb and rejects others", () => {
    expect(isValidHexColor("#aabbcc")).toBe(true);
    expect(isValidHexColor("#ABC123")).toBe(true);
    expect(isValidHexColor("#abc")).toBe(false);
    expect(isValidHexColor("abc123")).toBe(false);
    expect(isValidHexColor("#gggggg")).toBe(false);
    expect(isValidHexColor("")).toBe(false);
  });
});
