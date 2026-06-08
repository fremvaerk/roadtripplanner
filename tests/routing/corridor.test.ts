import { test, expect, describe } from "bun:test";
import { orderByCorridor, haversineMeters } from "@/lib/routing/corridor";

type P = { id: string; lat: number; lng: number };

describe("haversineMeters", () => {
  test("is ~0 for the same point and positive for different points", () => {
    expect(haversineMeters({ lat: 0, lng: 0 }, { lat: 0, lng: 0 })).toBe(0);
    expect(haversineMeters({ lat: 0, lng: 0 }, { lat: 0, lng: 1 })).toBeGreaterThan(100000);
  });
});

describe("orderByCorridor", () => {
  test("orders stops by progress from start to end (directional trip)", () => {
    const start = { lat: 0, lng: 0 };
    const end = { lat: 0, lng: 10 };
    const stops: P[] = [
      { id: "c", lat: 0.1, lng: 8 },
      { id: "a", lat: -0.1, lng: 2 },
      { id: "b", lat: 0.2, lng: 5 },
    ];
    expect(orderByCorridor(stops, start, end).map((s) => s.id)).toEqual(["a", "b", "c"]);
  });

  test("round trip (start≈end) falls back to nearest-neighbor from start", () => {
    const start = { lat: 0, lng: 0 };
    const end = { lat: 0, lng: 0 };
    const stops: P[] = [
      { id: "far", lat: 0, lng: 9 },
      { id: "near", lat: 0, lng: 1 },
      { id: "mid", lat: 0, lng: 5 },
    ];
    expect(orderByCorridor(stops, start, end).map((s) => s.id)).toEqual(["near", "mid", "far"]);
  });

  test("returns a new array and leaves the input unmutated", () => {
    const start = { lat: 0, lng: 0 };
    const end = { lat: 0, lng: 10 };
    const stops: P[] = [
      { id: "b", lat: 0, lng: 5 },
      { id: "a", lat: 0, lng: 1 },
    ];
    const out = orderByCorridor(stops, start, end);
    expect(out).not.toBe(stops);
    expect(stops.map((s) => s.id)).toEqual(["b", "a"]);
  });
});
