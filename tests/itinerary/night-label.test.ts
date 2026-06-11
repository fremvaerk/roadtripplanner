import { test, expect, describe } from "bun:test";
import { formatNightLabel } from "@/lib/itinerary/night-label";

describe("formatNightLabel", () => {
  test("a single night is just its number", () => {
    expect(formatNightLabel([3])).toBe("3");
  });
  test("consecutive nights collapse into a range", () => {
    expect(formatNightLabel([3, 4, 5])).toBe("3–5");
  });
  test("non-consecutive nights are comma-separated", () => {
    expect(formatNightLabel([3, 6])).toBe("3, 6");
  });
  test("mixes ranges and singletons", () => {
    expect(formatNightLabel([3, 4, 6])).toBe("3–4, 6");
    expect(formatNightLabel([3, 4, 5, 8])).toBe("3–5, 8");
  });
  test("ignores input order", () => {
    expect(formatNightLabel([5, 3, 4])).toBe("3–5");
  });
  test("empty input is an empty string", () => {
    expect(formatNightLabel([])).toBe("");
  });
});
