import { test, expect, describe } from "bun:test";
import { nearestLeg, type LegPath } from "@/lib/routing/nearest-leg";

const legs: LegPath[] = [
  { afterPoiId: null, coords: [{ lat: 0, lng: 0 }, { lat: 0, lng: 1 }] }, // along the equator
  { afterPoiId: "p1", coords: [{ lat: 5, lng: 0 }, { lat: 5, lng: 1 }] }, // ~555 km north
];

describe("nearestLeg", () => {
  test("returns the leg whose polyline is closest to the point", () => {
    expect(nearestLeg(legs, { lat: 0.1, lng: 0.5 })?.afterPoiId).toBe(null);
    expect(nearestLeg(legs, { lat: 4.9, lng: 0.5 })?.afterPoiId).toBe("p1");
  });

  test("returns null when there are no legs", () => {
    expect(nearestLeg([], { lat: 0, lng: 0 })).toBeNull();
  });

  test("handles a single-vertex leg by measuring distance to that vertex", () => {
    const one: LegPath[] = [{ afterPoiId: "x", coords: [{ lat: 0, lng: 0 }] }];
    expect(nearestLeg(one, { lat: 1, lng: 1 })?.afterPoiId).toBe("x");
  });

  test("a point essentially on a leg resolves to that leg", () => {
    expect(nearestLeg(legs, { lat: 5, lng: 0.5 })?.afterPoiId).toBe("p1");
  });
});
