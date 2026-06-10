import { test, expect, describe } from "bun:test";
import { buildDayRouteRequests, type TripVia } from "@/lib/routing/itinerary-route";
import type { TripDetail, PoiDetail } from "@/lib/api/trips";

function poi(id: string, dayId: string | null, orderInDay: number | null, lat: number, lng: number): PoiDetail {
  return {
    id, name: id, lat, lng, placeId: null, category: null, source: "user",
    dayId, orderInDay, status: "accepted", groupId: null, orderInGroup: null,
    address: null, description: null, imageUrl: null,
  };
}

function night(id: string, lat: number, lng: number) {
  return { id, lat, lng, title: null, url: null, notes: null };
}

function trip(over: Partial<TripDetail>): TripDetail {
  return {
    id: "t", title: "T", description: "", archivedAt: null,
    startName: "S", startLat: 0, startLng: 0,
    endName: null, endLat: null, endLng: null, isRoundTrip: false,
    startDate: null,
    days: [
      { id: "d1", dayIndex: 0, color: null, pois: [], night: null },
      { id: "d2", dayIndex: 1, color: null, pois: [], night: null },
    ],
    pois: [], poiGroups: [], routeVias: [],
    ...over,
  };
}

describe("buildDayRouteRequests", () => {
  test("one segment per day, split at the night (shared boundary)", () => {
    const t = trip({
      isRoundTrip: false, endLat: 0, endLng: 10,
      days: [
        { id: "d1", dayIndex: 0, color: null, pois: [], night: night("n1", 0, 4) },
        { id: "d2", dayIndex: 1, color: null, pois: [], night: null },
      ],
      pois: [poi("a", "d1", 0, 0, 2), poi("b", "d2", 0, 0, 6)],
    });
    const segs = buildDayRouteRequests(t, []);
    expect(segs.length).toBe(2);
    expect(segs[0].waypoints.map((w) => w.lng)).toEqual([0, 2, 4]);
    expect(segs[0].legDayId).toEqual(["d1", "d1"]);
    expect(segs[0].legAfterPoiId).toEqual([null, "a"]);
    expect(segs[1].waypoints.map((w) => w.lng)).toEqual([4, 6, 10]);
    expect(segs[1].legDayId).toEqual(["d2", "d2"]);
    expect(segs[1].legAfterPoiId).toEqual([null, "b"]);
  });

  test("a via attaches after its anchor as via:true and does not add a stopover leg", () => {
    const t = trip({
      endLat: 0, endLng: 10,
      days: [
        { id: "d1", dayIndex: 0, color: null, pois: [], night: night("n1", 0, 5) },
        { id: "d2", dayIndex: 1, color: null, pois: [], night: null },
      ],
      pois: [poi("a", "d1", 0, 0, 2)],
    });
    const vias: TripVia[] = [{ id: "v1", afterPoiId: "a", lat: 0, lng: 3, seq: 0 }];
    const segs = buildDayRouteRequests(t, vias);
    expect(segs[0].waypoints.map((w) => [w.lng, !!w.via])).toEqual([
      [0, false], [2, false], [3, true], [5, false],
    ]);
    expect(segs[0].legDayId).toEqual(["d1", "d1"]);
    expect(segs[0].legAfterPoiId).toEqual([null, "a"]);
  });

  test("round trip terminates back at the start", () => {
    const t = trip({
      isRoundTrip: true, endLat: null, endLng: null,
      days: [{ id: "d1", dayIndex: 0, color: null, pois: [], night: null }],
      pois: [poi("a", "d1", 0, 1, 1)],
    });
    const segs = buildDayRouteRequests(t, []);
    expect(segs.length).toBe(1);
    const wp = segs[0].waypoints;
    expect([wp[0].lat, wp[0].lng]).toEqual([0, 0]);
    expect([wp[wp.length - 1].lat, wp[wp.length - 1].lng]).toEqual([0, 0]);
  });

  test("no stops, no nights → single start→terminator segment", () => {
    const t = trip({ endLat: 0, endLng: 10, days: [{ id: "d1", dayIndex: 0, color: null, pois: [], night: null }], pois: [] });
    const segs = buildDayRouteRequests(t, []);
    expect(segs.length).toBe(1);
    expect(segs[0].waypoints.map((w) => w.lng)).toEqual([0, 10]);
    expect(segs[0].legDayId).toEqual([null]);
    expect(segs[0].legAfterPoiId).toEqual([null]);
  });
});
