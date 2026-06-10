import { test, expect, describe } from "bun:test";
import { attributeLegDurations } from "@/lib/routing/itinerary-route";

describe("attributeLegDurations", () => {
  test("sums leg seconds and meters per day and total", () => {
    const result = attributeLegDurations(["d1", "d2", "d2"], [100, 200, 50], [1000, 2000, 500]);
    expect(result.perDaySeconds).toEqual({ d1: 100, d2: 250 });
    expect(result.perDayMeters).toEqual({ d1: 1000, d2: 2500 });
    expect(result.totalSeconds).toBe(350);
    expect(result.totalMeters).toBe(3500);
  });

  test("ignores null-attributed legs in perDay but counts them in totals", () => {
    const result = attributeLegDurations([null], [120], [4000]);
    expect(result.perDaySeconds).toEqual({});
    expect(result.perDayMeters).toEqual({});
    expect(result.totalSeconds).toBe(120);
    expect(result.totalMeters).toBe(4000);
  });
});
