import { test, expect, describe } from "bun:test";
import { createTripSchema, updateTripSchema } from "@/lib/trips/schema";

describe("createTripSchema", () => {
  const base = {
    title: "Tuscany Loop",
    startName: "Florence, Italy",
    endName: "Rome, Italy",
    description: "A relaxed week of food and art.",
    dayCount: 6,
  };

  test("accepts a valid one-way trip", () => {
    const r = createTripSchema.safeParse(base);
    expect(r.success).toBe(true);
  });

  test("rejects a missing title", () => {
    const r = createTripSchema.safeParse({ ...base, title: "" });
    expect(r.success).toBe(false);
  });

  test("requires an end location unless round trip", () => {
    const r = createTripSchema.safeParse({ ...base, endName: undefined });
    expect(r.success).toBe(false);
  });

  test("allows missing end location for a round trip", () => {
    const r = createTripSchema.safeParse({ ...base, endName: undefined, isRoundTrip: true });
    expect(r.success).toBe(true);
  });

  test("coerces dayCount from a string and defaults to 1", () => {
    const r = createTripSchema.safeParse({ ...base, dayCount: "3" });
    expect(r.success && r.data.dayCount).toBe(3);
    const d = createTripSchema.safeParse({ ...base, dayCount: undefined });
    expect(d.success && d.data.dayCount).toBe(1);
  });
});

describe("updateTripSchema", () => {
  test("accepts a partial patch", () => {
    const r = updateTripSchema.safeParse({ title: "New name" });
    expect(r.success).toBe(true);
  });
});
