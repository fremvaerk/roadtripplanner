import { test, expect, describe } from "bun:test";
import { orderedRoutePoints, attributeLegDurations } from "@/lib/routing/itinerary-route";
import type { TripDetail, PoiDetail } from "@/lib/api/trips";

function poi(id: string, dayId: string | null, orderInDay: number | null, lat: number, lng: number): PoiDetail {
  return {
    id, name: id, lat, lng, placeId: null, category: null, source: "user",
    isOvernight: false, dayId, orderInDay, status: "accepted",
  };
}

function baseTrip(pois: PoiDetail[], end: { lat: number; lng: number } | null): TripDetail {
  return {
    id: "t", title: "T", description: "",
    startName: "Start", startLat: 0, startLng: 0,
    endName: end ? "End" : null, endLat: end?.lat ?? null, endLng: end?.lng ?? null,
    isRoundTrip: end === null,
    days: [
      { id: "d1", dayIndex: 0, pois: [] },
      { id: "d2", dayIndex: 1, pois: [] },
    ],
    pois,
  };
}

describe("orderedRoutePoints", () => {
  test("orders start, assigned stops by day/order, then end; legs attributed to arrival day", () => {
    const trip = baseTrip(
      [
        poi("a", "d1", 0, 1, 1),
        poi("b", "d2", 0, 2, 2),
        poi("pool", null, null, 9, 9), // excluded
      ],
      { lat: 3, lng: 3 },
    );
    const { coords, legDayId } = orderedRoutePoints(trip);
    expect(coords).toEqual([
      { lat: 0, lng: 0 },
      { lat: 1, lng: 1 },
      { lat: 2, lng: 2 },
      { lat: 3, lng: 3 },
    ]);
    expect(legDayId).toEqual(["d1", "d2", "d2"]);
  });

  test("round trip returns to start as the final point", () => {
    const trip = baseTrip([poi("a", "d1", 0, 1, 1)], null);
    const { coords } = orderedRoutePoints(trip);
    expect(coords[coords.length - 1]).toEqual({ lat: 0, lng: 0 });
  });

  test("no assigned stops yields just start and end", () => {
    const trip = baseTrip([poi("pool", null, null, 9, 9)], { lat: 3, lng: 3 });
    const { coords, legDayId } = orderedRoutePoints(trip);
    expect(coords).toEqual([{ lat: 0, lng: 0 }, { lat: 3, lng: 3 }]);
    expect(legDayId).toEqual([null]);
  });
});

describe("attributeLegDurations", () => {
  test("sums leg seconds per day and total", () => {
    const result = attributeLegDurations(["d1", "d2", "d2"], [100, 200, 50]);
    expect(result.perDaySeconds).toEqual({ d1: 100, d2: 250 });
    expect(result.totalSeconds).toBe(350);
  });

  test("ignores null-attributed legs in perDay but counts them in total", () => {
    const result = attributeLegDurations([null], [120]);
    expect(result.perDaySeconds).toEqual({});
    expect(result.totalSeconds).toBe(120);
  });
});
