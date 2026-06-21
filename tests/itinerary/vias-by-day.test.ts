import { test, expect, describe } from "bun:test";
import { viasByDay } from "@/lib/itinerary/vias-by-day";
import type { TripVia } from "@/lib/api/trips";

const days = [
  { id: "d1", dayIndex: 0 },
  { id: "d2", dayIndex: 1 },
];
const pois = [
  { id: "a", dayId: "d1" },
  { id: "b", dayId: "d2" },
  { id: "u", dayId: null }, // unscheduled
];
const via = (over: Partial<TripVia>): TripVia => ({
  id: "v", dayId: null, afterPoiId: null, lat: 0, lng: 0, seq: 0, ...over,
});

describe("viasByDay", () => {
  test("poi-anchored via follows its anchor poi's day", () => {
    const map = viasByDay({ days, pois, routeVias: [via({ id: "v1", afterPoiId: "b", dayId: null })] });
    expect(map.get("d2")?.map((v) => v.id)).toEqual(["v1"]);
    expect(map.has("d1")).toBe(false);
  });

  test("entry via uses its own dayId", () => {
    const map = viasByDay({ days, pois, routeVias: [via({ id: "v2", afterPoiId: null, dayId: "d2" })] });
    expect(map.get("d2")?.map((v) => v.id)).toEqual(["v2"]);
  });

  test("legacy null/null via falls to the first day", () => {
    const map = viasByDay({ days, pois, routeVias: [via({ id: "v0", afterPoiId: null, dayId: null })] });
    expect(map.get("d1")?.map((v) => v.id)).toEqual(["v0"]);
  });

  test("via anchored to an unscheduled poi is skipped", () => {
    const map = viasByDay({ days, pois, routeVias: [via({ id: "vx", afterPoiId: "u" })] });
    expect(map.size).toBe(0);
  });

  test("a day's vias are ordered by seq", () => {
    const map = viasByDay({
      days, pois,
      routeVias: [via({ id: "v2", dayId: "d1", seq: 2 }), via({ id: "v0", dayId: "d1", seq: 0 })],
    });
    expect(map.get("d1")?.map((v) => v.id)).toEqual(["v0", "v2"]);
  });
});
