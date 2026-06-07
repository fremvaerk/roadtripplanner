import { test, expect, describe } from "bun:test";
import { applyMove } from "@/lib/itinerary/move";
import type { TripDetail, PoiDetail } from "@/lib/api/trips";

function poi(id: string, dayId: string | null, orderInDay: number | null, extra: Partial<PoiDetail> = {}): PoiDetail {
  return {
    id, name: id, lat: 0, lng: 0, placeId: null, category: null,
    source: "user", isOvernight: false, dayId, orderInDay, status: "accepted", ...extra,
  };
}

function trip(pois: PoiDetail[]): TripDetail {
  return {
    id: "t", title: "T", description: "", startName: "S", startLat: 0, startLng: 0,
    endName: null, endLat: null, endLng: null, isRoundTrip: false,
    days: [
      { id: "d1", dayIndex: 0, pois: [] },
      { id: "d2", dayIndex: 1, pois: [] },
    ],
    pois,
  };
}

describe("applyMove", () => {
  test("inserts a pool POI into a day at an index and re-indexes", () => {
    const t = trip([poi("a", "d1", 0), poi("b", "d1", 1), poi("c", null, null)]);
    const out = applyMove(t, "c", "d1", 1);
    const inDay = out.pois.filter((p) => p.dayId === "d1").sort((x, y) => (x.orderInDay! - y.orderInDay!));
    expect(inDay.map((p) => p.id)).toEqual(["a", "c", "b"]);
    expect(inDay.map((p) => p.orderInDay)).toEqual([0, 1, 2]);
  });

  test("moving to the pool clears day/order/overnight and re-indexes the source day", () => {
    const t = trip([poi("a", "d1", 0, { isOvernight: true }), poi("b", "d1", 1)]);
    const out = applyMove(t, "a", null, 0);
    const a = out.pois.find((p) => p.id === "a")!;
    expect(a.dayId).toBeNull();
    expect(a.orderInDay).toBeNull();
    expect(a.isOvernight).toBe(false);
    expect(out.pois.find((p) => p.id === "b")!.orderInDay).toBe(0);
  });

  test("reorders within a day", () => {
    const t = trip([poi("a", "d1", 0), poi("b", "d1", 1), poi("c", "d1", 2)]);
    const out = applyMove(t, "c", "d1", 0);
    const inDay = out.pois.filter((p) => p.dayId === "d1").sort((x, y) => (x.orderInDay! - y.orderInDay!));
    expect(inDay.map((p) => p.id)).toEqual(["c", "a", "b"]);
  });

  test("returns the trip unchanged for an unknown poiId", () => {
    const t = trip([poi("a", "d1", 0)]);
    expect(applyMove(t, "zzz", "d2", 0)).toBe(t);
  });
});
