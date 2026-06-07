import { test, expect, describe } from "bun:test";
import { addPoiSchema } from "@/lib/itinerary/schema";

describe("addPoiSchema", () => {
  const base = { name: "Uffizi", lat: 43.768, lng: 11.255 };

  test("accepts the minimal valid body", () => {
    const r = addPoiSchema.safeParse(base);
    expect(r.success).toBe(true);
  });

  test("accepts optional fields", () => {
    const r = addPoiSchema.safeParse({
      ...base,
      placeId: "p1",
      category: "sight",
      source: "search",
      dayId: "day1",
    });
    expect(r.success).toBe(true);
  });

  test("rejects a missing name", () => {
    expect(addPoiSchema.safeParse({ lat: 1, lng: 2 }).success).toBe(false);
  });

  test("rejects non-numeric coordinates", () => {
    expect(addPoiSchema.safeParse({ name: "X", lat: "a", lng: 2 }).success).toBe(false);
  });

  test("rejects an unknown source", () => {
    expect(addPoiSchema.safeParse({ ...base, source: "bogus" }).success).toBe(false);
  });
});
