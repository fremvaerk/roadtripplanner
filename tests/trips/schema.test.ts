import { test, expect, describe } from "bun:test";
import { createTripSchema, updateTripSchema } from "@/lib/trips/schema";

describe("createTripSchema", () => {
  const base = {
    title: "Tuscany Loop",
    startName: "Florence, Italy",
  };

  test("accepts a start-only trip (no end, no description)", () => {
    const r = createTripSchema.safeParse(base);
    expect(r.success).toBe(true);
    expect(r.success && r.data.dayCount).toBe(1);
  });

  test("accepts an optional description", () => {
    const r = createTripSchema.safeParse({ ...base, description: "A relaxed week." });
    expect(r.success).toBe(true);
  });

  test("rejects a missing title", () => {
    const r = createTripSchema.safeParse({ ...base, title: "" });
    expect(r.success).toBe(false);
  });

  test("rejects a missing start location", () => {
    const r = createTripSchema.safeParse({ title: "X" });
    expect(r.success).toBe(false);
  });
});

describe("updateTripSchema", () => {
  test("accepts a partial patch", () => {
    const r = updateTripSchema.safeParse({ title: "New name" });
    expect(r.success).toBe(true);
  });

  test("accepts a valid YYYY-MM-DD startDate and null", () => {
    expect(updateTripSchema.safeParse({ startDate: "2026-06-09" }).success).toBe(true);
    expect(updateTripSchema.safeParse({ startDate: null }).success).toBe(true);
  });

  test("rejects a malformed startDate string", () => {
    expect(updateTripSchema.safeParse({ startDate: "banana" }).success).toBe(false);
    expect(updateTripSchema.safeParse({ startDate: "2026-6-9" }).success).toBe(false);
  });
});
