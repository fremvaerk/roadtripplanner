import { test, expect, describe } from "bun:test";
import { dayDate } from "@/lib/dates";

describe("dayDate", () => {
  test("Day 0 is the start date (UTC)", () => {
    expect(dayDate("2026-06-09", 0)?.toISOString().slice(0, 10)).toBe("2026-06-09");
  });
  test("adds dayIndex days", () => {
    expect(dayDate("2026-06-09", 2)?.toISOString().slice(0, 10)).toBe("2026-06-11");
  });
  test("crosses month boundaries", () => {
    expect(dayDate("2026-06-30", 2)?.toISOString().slice(0, 10)).toBe("2026-07-02");
  });
  test("accepts a full ISO datetime", () => {
    expect(dayDate("2026-06-09T00:00:00.000Z", 1)?.toISOString().slice(0, 10)).toBe("2026-06-10");
  });
  test("returns null for null or invalid input", () => {
    expect(dayDate(null, 0)).toBeNull();
    expect(dayDate("not-a-date", 0)).toBeNull();
  });
});
