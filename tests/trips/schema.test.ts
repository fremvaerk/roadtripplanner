import { test, expect, describe } from "bun:test";
import { createTripSchema, updateTripSchema } from "@/lib/trips/schema";

describe("createTripSchema", () => {
  const base = {
    title: "Tuscany Loop",
    start: { name: "Florence, Italy", lat: 43.77, lng: 11.25, placeId: "abc" },
  };

  test("accepts a start-only trip (defaults to 1 day, no finish)", () => {
    const r = createTripSchema.safeParse(base);
    expect(r.success).toBe(true);
    expect(r.success && r.data.dayCount).toBe(1);
  });

  test("accepts finish + cover + start date", () => {
    const r = createTripSchema.safeParse({
      ...base,
      startDate: "2026-06-09",
      finish: { mode: "place", place: { name: "Rome", lat: 41.9, lng: 12.5, placeId: null } },
      coverImage: "https://example.com/c.jpg",
    });
    expect(r.success).toBe(true);
  });

  test("rejects finish place without a place", () => {
    const r = createTripSchema.safeParse({ ...base, finish: { mode: "place" } });
    expect(r.success).toBe(false);
  });

  test("rejects a missing title", () => {
    expect(createTripSchema.safeParse({ ...base, title: "" }).success).toBe(false);
  });

  test("rejects a missing/invalid start", () => {
    expect(createTripSchema.safeParse({ title: "X" }).success).toBe(false);
    expect(createTripSchema.safeParse({ title: "X", start: "Florence" }).success).toBe(false);
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

  test("accepts a start patch", () => {
    const r = updateTripSchema.safeParse({
      start: { name: "Pisa", lat: 43.72, lng: 10.4, placeId: null },
    });
    expect(r.success).toBe(true);
  });

  test("accepts finish open/round without a place", () => {
    expect(updateTripSchema.safeParse({ finish: { mode: "open" } }).success).toBe(true);
    expect(updateTripSchema.safeParse({ finish: { mode: "round" } }).success).toBe(true);
  });

  test("accepts finish place with a place", () => {
    const r = updateTripSchema.safeParse({
      finish: { mode: "place", place: { name: "Rome", lat: 41.9, lng: 12.5, placeId: null } },
    });
    expect(r.success).toBe(true);
  });

  test("rejects finish place without a place", () => {
    expect(updateTripSchema.safeParse({ finish: { mode: "place" } }).success).toBe(false);
  });

  test("accepts an archived boolean", () => {
    expect(updateTripSchema.safeParse({ archived: true }).success).toBe(true);
    expect(updateTripSchema.safeParse({ archived: false }).success).toBe(true);
  });

  test("rejects a non-boolean archived", () => {
    expect(updateTripSchema.safeParse({ archived: "yes" }).success).toBe(false);
  });
});
