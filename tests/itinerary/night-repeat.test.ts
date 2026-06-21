import { test, expect, describe } from "bun:test";
import { followingDayIds, followingDayCount } from "@/lib/itinerary/night-repeat";

const days = [
  { id: "d0", dayIndex: 0 },
  { id: "d1", dayIndex: 1 },
  { id: "d2", dayIndex: 2 },
  { id: "d3", dayIndex: 3 },
];

describe("followingDayIds", () => {
  test("returns the next N days by dayIndex", () => {
    expect(followingDayIds(days, "d1", 2)).toEqual(["d2", "d3"]);
  });

  test("caps at the days that actually follow", () => {
    expect(followingDayIds(days, "d2", 5)).toEqual(["d3"]);
  });

  test("returns [] for the last day, count<=0, or unknown id", () => {
    expect(followingDayIds(days, "d3", 3)).toEqual([]);
    expect(followingDayIds(days, "d1", 0)).toEqual([]);
    expect(followingDayIds(days, "nope", 2)).toEqual([]);
  });

  test("orders by dayIndex regardless of input order", () => {
    const shuffled = [days[3], days[0], days[2], days[1]];
    expect(followingDayIds(shuffled, "d0", 2)).toEqual(["d1", "d2"]);
  });
});

describe("followingDayCount", () => {
  test("counts the days after the given one", () => {
    expect(followingDayCount(days, "d0")).toBe(3);
    expect(followingDayCount(days, "d2")).toBe(1);
    expect(followingDayCount(days, "d3")).toBe(0);
    expect(followingDayCount(days, "nope")).toBe(0);
  });
});
