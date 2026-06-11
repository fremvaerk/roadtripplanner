import { test, expect, describe } from "bun:test";
import { dayDate, todayDayIndex } from "@/lib/dates";

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

describe("todayDayIndex", () => {
  const start = "2026-06-12";
  const at = (iso: string) => new Date(iso + "T08:00:00.000Z");
  test("today on day 0 → 0", () => {
    expect(todayDayIndex(start, 3, at("2026-06-12"))).toBe(0);
  });
  test("today on the middle day → its index", () => {
    expect(todayDayIndex(start, 3, at("2026-06-13"))).toBe(1);
  });
  test("today on the last day → last index", () => {
    expect(todayDayIndex(start, 3, at("2026-06-14"))).toBe(2);
  });
  test("the day after the trip ends → null", () => {
    expect(todayDayIndex(start, 3, at("2026-06-15"))).toBeNull();
  });
  test("before the trip starts → null", () => {
    expect(todayDayIndex(start, 3, at("2026-06-11"))).toBeNull();
  });
  test("no start date or no days → null", () => {
    expect(todayDayIndex(null, 3, at("2026-06-13"))).toBeNull();
    expect(todayDayIndex(start, 0, at("2026-06-13"))).toBeNull();
  });
});
