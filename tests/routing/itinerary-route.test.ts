import { test, expect, describe } from "bun:test";
import { orderedRoutePoints, attributeLegDurations, buildRoute } from "@/lib/routing/itinerary-route";
import type { TripDetail, PoiDetail, DayNight } from "@/lib/api/trips";

function night(lat: number, lng: number): DayNight {
  return { id: `n${lat}`, lat, lng, title: null, url: null, notes: null };
}

function poi(id: string, dayId: string | null, orderInDay: number | null, lat: number, lng: number): PoiDetail {
  return {
    id, name: id, lat, lng, placeId: null, category: null, source: "user",
    dayId, orderInDay, status: "accepted", groupId: null, orderInGroup: null,
  };
}

function baseTrip(pois: PoiDetail[], end: { lat: number; lng: number } | null): TripDetail {
  return {
    id: "t", title: "T", description: "",
    startName: "Start", startLat: 0, startLng: 0,
    endName: end ? "End" : null, endLat: end?.lat ?? null, endLng: end?.lng ?? null,
    isRoundTrip: end === null,
    days: [
      { id: "d1", dayIndex: 0, pois: [], night: null },
      { id: "d2", dayIndex: 1, pois: [], night: null },
    ],
    pois,
    poiGroups: [],
    routeVias: [],
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
  test("sums leg seconds and meters per day and total", () => {
    const result = attributeLegDurations(["d1", "d2", "d2"], [100, 200, 50], [1000, 2000, 500]);
    expect(result.perDaySeconds).toEqual({ d1: 100, d2: 250 });
    expect(result.perDayMeters).toEqual({ d1: 1000, d2: 2500 });
    expect(result.totalSeconds).toBe(350);
    expect(result.totalMeters).toBe(3500);
  });

  test("ignores null-attributed legs in perDay but counts them in totals", () => {
    const result = attributeLegDurations([null], [120], [4000]);
    expect(result.perDaySeconds).toEqual({});
    expect(result.perDayMeters).toEqual({});
    expect(result.totalSeconds).toBe(120);
    expect(result.totalMeters).toBe(4000);
  });
});

describe("buildRoute night-boundary attribution", () => {
  function nightsTrip(): TripDetail {
    return {
      id: "t", title: "T", description: "",
      startName: "S", startLat: 0, startLng: 0,
      endName: "E", endLat: 10, endLng: 10, isRoundTrip: false,
      startDate: null,
      days: [
        { id: "d0", dayIndex: 0, pois: [], night: night(1, 1) },
        { id: "d1", dayIndex: 1, pois: [], night: night(2, 2) },
        { id: "d2", dayIndex: 2, pois: [], night: night(3, 3) },
        { id: "d3", dayIndex: 3, pois: [], night: null },
      ],
      pois: [],
      poiGroups: [],
      routeVias: [],
    };
  }

  test("the drive after the final night belongs to the next (final) day, not the night's own day", () => {
    // stopovers: start, n0(d0), n1(d1), n2(d2), end
    // legs:      start->n0, n0->n1, n1->n2, n2->end
    const { legDayId } = buildRoute(nightsTrip(), []);
    expect(legDayId).toEqual(["d0", "d1", "d2", "d3"]);
  });

  test("a trailing leg after a stop (no night) stays on that stop's day", () => {
    const trip = nightsTrip();
    trip.days = [
      { id: "d0", dayIndex: 0, pois: [], night: night(1, 1) },
      { id: "d1", dayIndex: 1, pois: [], night: null },
    ];
    trip.pois = [
      { id: "a", name: "A", lat: 5, lng: 5, placeId: null, category: null, source: "user",
        dayId: "d1", orderInDay: 0, status: "accepted", groupId: null, orderInGroup: null },
    ];
    // stopovers: start, n0(d0), A(d1), end ; legs: start->n0(d0), n0->A(d1), A->end(d1)
    const { legDayId } = buildRoute(trip, []);
    expect(legDayId).toEqual(["d0", "d1", "d1"]);
  });
});
