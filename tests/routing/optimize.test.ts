import { test, expect, describe } from "bun:test";
import { applyOptimizedOrder } from "@/lib/routing/optimize";

describe("applyOptimizedOrder", () => {
  test("reorders items by the optimized index array", () => {
    expect(applyOptimizedOrder(["a", "b", "c"], [2, 0, 1])).toEqual(["c", "a", "b"]);
  });

  test("returns items unchanged when indices length mismatches", () => {
    const items = ["a", "b", "c"];
    expect(applyOptimizedOrder(items, [0, 1])).toEqual(["a", "b", "c"]);
  });

  test("returns items unchanged when indices are out of range", () => {
    const items = ["a", "b"];
    expect(applyOptimizedOrder(items, [0, 5])).toEqual(["a", "b"]);
  });

  test("returns items unchanged when indices contain duplicates", () => {
    const items = ["a", "b", "c"];
    expect(applyOptimizedOrder(items, [0, 0, 1])).toEqual(["a", "b", "c"]);
  });

  test("handles an empty list", () => {
    expect(applyOptimizedOrder([], [])).toEqual([]);
  });
});
