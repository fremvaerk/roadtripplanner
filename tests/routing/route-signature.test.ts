import { test, expect, describe } from "bun:test";
import { routeSignature } from "@/lib/routing/route-signature";
import type { TripDetail, PoiDetail } from "@/lib/api/trips";

function poi(id: string, dayId: string | null, orderInDay: number | null, lat: number, lng: number): PoiDetail {
  return {
    id, name: id, lat, lng, placeId: null, category: null, source: "user",
    dayId, orderInDay, status: "accepted", groupId: null, orderInGroup: null,
    address: null, description: null, imageUrl: null,
  };
}

function trip(over: Partial<TripDetail>): TripDetail {
  return {
    id: "t", title: "T", description: "", archivedAt: null,
    startName: "S", startLat: 0, startLng: 0,
    endName: null, endLat: 0, endLng: 10, isRoundTrip: false,
    startDate: null,
    days: [
      { id: "d1", dayIndex: 0, color: null, pois: [], night: null },
      { id: "d2", dayIndex: 1, color: null, pois: [], night: null },
    ],
    pois: [poi("a", "d1", 0, 0, 2)],
    poiGroups: [], routeVias: [],
    ...over,
  };
}

describe("routeSignature", () => {
  test("unchanged for the same route inputs (and for non-route field edits)", () => {
    const base = trip({});
    expect(routeSignature(trip({}))).toBe(routeSignature(base));
    // Title / description / archived don't affect the route → same signature.
    expect(routeSignature(trip({ title: "Renamed", description: "x" }))).toBe(routeSignature(base));
  });

  test("changes when a stop moves to different coordinates", () => {
    const base = routeSignature(trip({}));
    expect(routeSignature(trip({ pois: [poi("a", "d1", 0, 0, 7)] }))).not.toBe(base);
  });

  test("changes when a stop moves to another day", () => {
    const base = routeSignature(trip({}));
    expect(routeSignature(trip({ pois: [poi("a", "d2", 0, 0, 2)] }))).not.toBe(base);
  });

  test("changes when the finish / round-trip flag changes", () => {
    const base = routeSignature(trip({}));
    expect(routeSignature(trip({ endLng: 99 }))).not.toBe(base);
    expect(routeSignature(trip({ isRoundTrip: true, endName: null, endLat: null, endLng: null }))).not.toBe(base);
  });

  test("changes when a via is added", () => {
    const base = routeSignature(trip({}));
    expect(routeSignature(trip({ routeVias: [{ id: "v1", afterPoiId: "a", lat: 0, lng: 3, seq: 0 }] }))).not.toBe(base);
  });
});
