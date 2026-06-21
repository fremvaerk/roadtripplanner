import { test, expect, describe } from "bun:test";
import { formatNightLabel, formatNightStay } from "@/lib/itinerary/night-label";

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
  test("duplicate numbers collapse", () => {
    expect(formatNightLabel([4, 4])).toBe("4");
    expect(formatNightLabel([3, 4, 4, 5])).toBe("3–5");
  });
});

describe("formatNightStay", () => {
  test("single night shows check-in → check-out", () => {
    expect(formatNightStay([3], "13 Jun", "14 Jun")).toBe("1 night · 13 Jun → 14 Jun");
  });
  test("contiguous multi-night shows the full span", () => {
    expect(formatNightStay([3, 4, 5], "13 Jun", "16 Jun")).toBe("3 nights · 13 Jun → 16 Jun");
  });
  test("no dates → just the count", () => {
    expect(formatNightStay([3], null, null)).toBe("1 night");
    expect(formatNightStay([3, 4, 5], null, null)).toBe("3 nights");
  });
  test("non-contiguous group falls back to the number label", () => {
    expect(formatNightStay([3, 6], "13 Jun", "17 Jun")).toBe("2 nights (nights 3, 6)");
  });
});
