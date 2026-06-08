import { test, expect, describe } from "bun:test";
import { addPoiSchema, patchPoiSchema, createGroupSchema } from "@/lib/itinerary/schema";

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

describe("patchPoiSchema", () => {
  test("accepts a move op (day target)", () => {
    expect(patchPoiSchema.safeParse({ op: "move", dayId: "d1", orderInDay: 2 }).success).toBe(true);
  });
  test("accepts a move op to the pool (null day)", () => {
    expect(patchPoiSchema.safeParse({ op: "move", dayId: null, orderInDay: 0 }).success).toBe(true);
  });
  test("accepts an overnight op", () => {
    expect(patchPoiSchema.safeParse({ op: "overnight", isOvernight: true }).success).toBe(true);
  });
  test("rejects an unknown op", () => {
    expect(patchPoiSchema.safeParse({ op: "bogus" }).success).toBe(false);
  });
  test("rejects a negative orderInDay", () => {
    expect(patchPoiSchema.safeParse({ op: "move", dayId: "d1", orderInDay: -1 }).success).toBe(false);
  });
});

describe("createGroupSchema", () => {
  test("accepts a non-empty name", () => {
    expect(createGroupSchema.safeParse({ name: "Wineries" }).success).toBe(true);
  });
  test("rejects an empty name", () => {
    expect(createGroupSchema.safeParse({ name: "" }).success).toBe(false);
  });
});

describe("patchPoiSchema group op", () => {
  test("accepts a group op (group + index)", () => {
    expect(patchPoiSchema.safeParse({ op: "group", groupId: "g1", orderInGroup: 0 }).success).toBe(true);
  });
  test("accepts a group op to ungrouped (null)", () => {
    expect(patchPoiSchema.safeParse({ op: "group", groupId: null, orderInGroup: 2 }).success).toBe(true);
  });
});
