import { test, expect, describe } from "bun:test";
import { splitByDriveCap, DEFAULT_DAILY_DRIVE_MAX_SECONDS } from "@/lib/routing/split";

describe("splitByDriveCap", () => {
  test("advances a day when the cap would be exceeded", () => {
    expect(splitByDriveCap([60, 60, 60, 60], 3, 100)).toEqual([0, 1, 2, 2]);
  });

  test("keeps stops together while under the cap", () => {
    expect(splitByDriveCap([30, 30, 30], 3, 100)).toEqual([0, 0, 0]);
  });

  test("never creates an empty day from a single over-cap leg (first stop of a day)", () => {
    expect(splitByDriveCap([200, 200, 200], 2, 100)).toEqual([0, 1, 1]);
  });

  test("the last day absorbs the remainder regardless of cap", () => {
    expect(splitByDriveCap([60, 60, 60, 60, 60], 2, 100)).toEqual([0, 1, 1, 1, 1]);
  });

  test("handles a single day", () => {
    expect(splitByDriveCap([60, 60, 60], 1, 100)).toEqual([0, 0, 0]);
  });

  test("exposes a sane default cap", () => {
    expect(DEFAULT_DAILY_DRIVE_MAX_SECONDS).toBe(5 * 3600);
  });
});
