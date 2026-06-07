import { test, expect, describe } from "bun:test";
import { categoryFromTypes } from "@/lib/places/category";

describe("categoryFromTypes", () => {
  test("maps food-related types to 'food'", () => {
    expect(categoryFromTypes(["restaurant", "point_of_interest"])).toBe("food");
    expect(categoryFromTypes(["cafe"])).toBe("food");
  });

  test("maps sights to 'sight'", () => {
    expect(categoryFromTypes(["tourist_attraction"])).toBe("sight");
    expect(categoryFromTypes(["museum"])).toBe("sight");
  });

  test("maps nature to 'nature'", () => {
    expect(categoryFromTypes(["park"])).toBe("nature");
    expect(categoryFromTypes(["natural_feature"])).toBe("nature");
  });

  test("maps lodging to 'lodging'", () => {
    expect(categoryFromTypes(["lodging"])).toBe("lodging");
  });

  test("falls back to 'other' for unknown or empty", () => {
    expect(categoryFromTypes(["locality"])).toBe("other");
    expect(categoryFromTypes([])).toBe("other");
  });

  test("prefers the first matching known type in priority order", () => {
    expect(categoryFromTypes(["lodging", "restaurant"])).toBe("lodging");
  });
});
