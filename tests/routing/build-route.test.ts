import { test, expect, describe } from "bun:test";
import { buildRoute, type TripVia } from "@/lib/routing/itinerary-route";
import type { TripDetail, PoiDetail } from "@/lib/api/trips";

function poi(id: string, dayId: string | null, orderInDay: number | null, lat: number, lng: number): PoiDetail {
  return {
    id, name: id, lat, lng, placeId: null, category: null, source: "user",
    isOvernight: false, dayId, orderInDay, status: "accepted", groupId: null, orderInGroup: null,
  };
}

function trip(pois: PoiDetail[]): TripDetail {
  return {
    id: "t", title: "T", description: "",
    startName: "S", startLat: 0, startLng: 0,
    endName: "E", endLat: 0, endLng: 10, isRoundTrip: false,
    days: [{ id: "d1", dayIndex: 0, pois: [] }],
    pois, poiGroups: [], routeVias: [],
  };
}

describe("buildRoute", () => {
  test("inserts a via after its anchor stop as via:true; legs stay stop-to-stop", () => {
    const t = trip([poi("a", "d1", 0, 0, 2), poi("b", "d1", 1, 0, 5)]);
    const vias: TripVia[] = [{ id: "v1", afterPoiId: "a", lat: 0, lng: 3, seq: 0 }];
    const { waypoints, legDayId, legAfterPoiId } = buildRoute(t, vias);
    expect(waypoints.map((w) => [w.lat, w.lng, !!w.via])).toEqual([
      [0, 0, false],
      [0, 2, false],
      [0, 3, true],
      [0, 5, false],
      [0, 10, false],
    ]);
    expect(legAfterPoiId).toEqual([null, "a", "b"]);
    expect(legDayId).toEqual(["d1", "d1", "d1"]);
  });

  test("via with null anchor goes right after start", () => {
    const t = trip([poi("a", "d1", 0, 0, 2)]);
    const vias: TripVia[] = [{ id: "v1", afterPoiId: null, lat: 0, lng: 1, seq: 0 }];
    const { waypoints } = buildRoute(t, vias);
    expect(waypoints.map((w) => [w.lng, !!w.via])).toEqual([
      [0, false],
      [1, true],
      [2, false],
      [10, false],
    ]);
  });

  test("skips vias whose anchor stop is not scheduled", () => {
    const t = trip([poi("a", "d1", 0, 0, 2)]);
    const vias: TripVia[] = [{ id: "v1", afterPoiId: "ghost", lat: 0, lng: 3, seq: 0 }];
    const { waypoints } = buildRoute(t, vias);
    expect(waypoints.some((w) => w.via)).toBe(false);
  });

  test("no stops yields start + end with one leg", () => {
    const t = trip([]);
    const { waypoints, legAfterPoiId, legDayId } = buildRoute(t, []);
    expect(waypoints.length).toBe(2);
    expect(legAfterPoiId).toEqual([null]);
    expect(legDayId).toEqual([null]);
  });
});
