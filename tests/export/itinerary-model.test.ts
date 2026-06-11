import { test, expect, describe } from "bun:test";
import { buildExportModel } from "@/lib/export/itinerary-model";
import { decodePolyline } from "@/lib/export/polyline";
import { defaultDayColor } from "@/lib/places/group-colors";
import type { TripDetail, DayDetail, PoiDetail } from "@/lib/api/trips";

/** Encode lat/lng points into a Google encoded polyline (inverse of decodePolyline). */
function encodePolyline(points: { lat: number; lng: number }[]): string {
  const enc = (v: number) => {
    let n = v < 0 ? ~(v << 1) : v << 1;
    let out = "";
    while (n >= 0x20) {
      out += String.fromCharCode((0x20 | (n & 0x1f)) + 63);
      n >>= 5;
    }
    out += String.fromCharCode(n + 63);
    return out;
  };
  let lat = 0;
  let lng = 0;
  let out = "";
  for (const p of points) {
    const la = Math.round(p.lat * 1e5);
    const ln = Math.round(p.lng * 1e5);
    out += enc(la - lat) + enc(ln - lng);
    lat = la;
    lng = ln;
  }
  return out;
}

function poi(overrides: Partial<PoiDetail> & { name: string; lat: number; lng: number }): PoiDetail {
  return {
    id: overrides.name,
    placeId: null,
    category: null,
    source: "manual",
    dayId: null,
    orderInDay: null,
    status: "active",
    groupId: null,
    orderInGroup: null,
    address: null,
    description: null,
    imageUrl: null,
    ...overrides,
  };
}

function day(overrides: Partial<DayDetail> & { id: string; dayIndex: number }): DayDetail {
  return {
    color: null,
    pois: [],
    night: null,
    ...overrides,
  };
}

function trip(overrides: Partial<TripDetail>): TripDetail {
  return {
    id: "t1",
    title: "My Trip",
    description: "",
    startName: "Start City",
    startLat: 10,
    startLng: 20,
    endName: null,
    endLat: null,
    endLng: null,
    isRoundTrip: false,
    startDate: null,
    archivedAt: null,
    days: [],
    pois: [],
    poiGroups: [],
    routeVias: [],
    ...overrides,
  };
}

describe("buildExportModel", () => {
  test("sorts days by dayIndex and stops by orderInDay", () => {
    const t = trip({
      days: [
        day({
          id: "d2",
          dayIndex: 1,
          pois: [
            poi({ name: "B2", lat: 1, lng: 1, orderInDay: 1 }),
            poi({ name: "B1", lat: 2, lng: 2, orderInDay: 0 }),
          ],
        }),
        day({
          id: "d1",
          dayIndex: 0,
          pois: [poi({ name: "A1", lat: 3, lng: 3, orderInDay: 0 })],
        }),
      ],
    });
    const m = buildExportModel(t);
    expect(m.days.map((d) => d.index)).toEqual([0, 1]);
    expect(m.days[1].stops.map((s) => s.name)).toEqual(["B1", "B2"]);
  });

  test("label contains 'Day 1' without a start date", () => {
    const t = trip({ days: [day({ id: "d1", dayIndex: 0 })] });
    const label = buildExportModel(t).days[0].label;
    expect(label.includes("Day 1")).toBe(true);
    expect(label.length).toBe("Day 1".length);
  });

  test("label includes a date when startDate is set", () => {
    const t = trip({ startDate: "2026-06-09", days: [day({ id: "d1", dayIndex: 0 })] });
    const label = buildExportModel(t).days[0].label;
    expect(label.includes("Day 1")).toBe(true);
    expect(label.length).toBeGreaterThan("Day 1".length);
    expect(label.toLowerCase()).toContain("jun");
  });

  test("color falls back to defaultDayColor when day.color is null", () => {
    const t = trip({ days: [day({ id: "d1", dayIndex: 2, color: null })] });
    expect(buildExportModel(t).days[0].color).toBe(defaultDayColor(2));
  });

  test("color uses day.color when set", () => {
    const t = trip({ days: [day({ id: "d1", dayIndex: 0, color: "#123456" })] });
    expect(buildExportModel(t).days[0].color).toBe("#123456");
  });

  test("end is a place when endLat/endLng are set", () => {
    const t = trip({ endLat: 50, endLng: 60, endName: "Finish" });
    const m = buildExportModel(t);
    expect(m.end).toEqual({ lat: 50, lng: 60, name: "Finish" });
  });

  test("end defaults to 'End' name when endName is null", () => {
    const t = trip({ endLat: 50, endLng: 60, endName: null });
    expect(buildExportModel(t).end).toEqual({ lat: 50, lng: 60, name: "End" });
  });

  test("end equals start coords when round trip and no endLat", () => {
    const t = trip({ isRoundTrip: true, startLat: 10, startLng: 20, startName: "Start City" });
    expect(buildExportModel(t).end).toEqual({ lat: 10, lng: 20, name: "Start City" });
  });

  test("end is null when open (not round trip, no endLat)", () => {
    const t = trip({ isRoundTrip: false });
    expect(buildExportModel(t).end).toBeNull();
  });

  test("night maps title or defaults to 'Night stop'", () => {
    const t = trip({
      days: [
        day({ id: "d1", dayIndex: 0, night: { id: "n1", lat: 5, lng: 6, title: "Hotel", url: null, notes: null } }),
        day({ id: "d2", dayIndex: 1, night: { id: "n2", lat: 7, lng: 8, title: null, url: null, notes: null } }),
      ],
    });
    const m = buildExportModel(t);
    expect(m.days[0].night).toEqual({ lat: 5, lng: 6, name: "Hotel" });
    expect(m.days[1].night).toEqual({ lat: 7, lng: 8, name: "Night stop" });
  });

  test("origin is the trip start on day 0 and the previous night after that", () => {
    const t = trip({
      days: [
        day({ id: "d1", dayIndex: 0, night: { id: "n1", lat: 30, lng: 40, title: "Night 1", url: null, notes: null } }),
        day({ id: "d2", dayIndex: 1, night: { id: "n2", lat: 50, lng: 60, title: "Night 2", url: null, notes: null } }),
      ],
    });
    const m = buildExportModel(t);
    expect(m.days[0].origin).toEqual({ lat: 10, lng: 20, name: "Start City" });
    expect(m.days[1].origin).toEqual({ lat: 30, lng: 40, name: "Night 1" });
  });

  test("origin falls back to start when the previous day had no night", () => {
    const t = trip({
      days: [day({ id: "d1", dayIndex: 0 }), day({ id: "d2", dayIndex: 1 })],
    });
    const m = buildExportModel(t);
    expect(m.days[1].origin).toEqual({ lat: 10, lng: 20, name: "Start City" });
  });

  test("path is empty with no route", () => {
    const t = trip({ days: [day({ id: "d1", dayIndex: 0 })] });
    expect(buildExportModel(t).days[0].path).toEqual([]);
  });

  test("path dedups the seam between two legs", () => {
    const legA = "_p~iF~ps|U_ulLnnqC"; // [ (38.5,-120.2), (40.7,-120.95) ]
    const aPts = decodePolyline(legA);
    const seam = aPts[aPts.length - 1]; // shared endpoint
    // leg B starts at A's last point, then continues to a new point.
    const legB = encodePolyline([seam, { lat: 41.5, lng: -121.5 }]);
    const t = trip({ days: [day({ id: "d1", dayIndex: 0 })] });
    const route = {
      legs: [
        { encodedPolyline: legA, dayId: "d1" },
        { encodedPolyline: legB, dayId: "d1" },
      ],
    };
    const path = buildExportModel(t, route).days[0].path;
    // 2 points + 2 points sharing the seam -> 3
    expect(path.length).toBe(3);
    for (let i = 0; i < path.length - 1; i++) {
      expect(path[i].lat === path[i + 1].lat && path[i].lng === path[i + 1].lng).toBe(false);
    }
  });

  test("path only includes legs for the matching day", () => {
    const encoded = "_p~iF~ps|U_ulLnnqC";
    const t = trip({
      days: [day({ id: "d1", dayIndex: 0 }), day({ id: "d2", dayIndex: 1 })],
    });
    const route = {
      legs: [
        { encodedPolyline: encoded, dayId: "d2" },
        { encodedPolyline: null, dayId: "d1" },
      ],
    };
    const m = buildExportModel(t, route);
    expect(m.days[0].path).toEqual([]);
    expect(m.days[1].path.length).toBe(decodePolyline(encoded).length);
  });
});
