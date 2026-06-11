import { test, expect, describe } from "bun:test";
import { buildGpx } from "@/lib/export/gpx";
import type { ExportModel } from "@/lib/export/itinerary-model";

// A minimal model with known counts:
// - start (1 wpt)
// - day 0: 2 stops + 1 night, path of 3 points
// - day 1: 1 stop  + 0 night, path of 2 points
// - end set (1 wpt)
// Expected wpt = 1 + (2 + 1) + (1 + 0) + 1 = 6
// Expected nights = 1, stops total = 3
// Expected trk = 2, trkpt total = 3 + 2 = 5
const model: ExportModel = {
  title: "Test & <Trip>",
  start: { lat: 10, lng: 20, name: "Start & Go" },
  end: { lat: 99, lng: 88, name: "End" },
  days: [
    {
      index: 0,
      label: "Day 1 & <one>",
      color: "#fff",
      stops: [
        { lat: 1, lng: 2, name: "Stop A" },
        { lat: 3, lng: 4, name: "Stop B" },
      ],
      night: { lat: 5, lng: 6, name: "Night 1" },
      path: [
        { lat: 0.1, lng: 0.2 },
        { lat: 0.3, lng: 0.4 },
        { lat: 0.5, lng: 0.6 },
      ],
    },
    {
      index: 1,
      label: "Day 2",
      color: "#000",
      stops: [{ lat: 7, lng: 8, name: "Stop C" }],
      night: null,
      path: [
        { lat: 1.1, lng: 1.2 },
        { lat: 1.3, lng: 1.4 },
      ],
    },
  ],
};

const count = (haystack: string, needle: string): number =>
  haystack.split(needle).length - 1;

describe("buildGpx", () => {
  const gpx = buildGpx(model);

  test("starts with the XML declaration and contains the gpx root", () => {
    expect(gpx.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(gpx).toContain('<gpx version="1.1" creator="RoadTripPlanner"');
  });

  test("total <wpt count matches start + stops + nights + end", () => {
    const stops = model.days.reduce((n, d) => n + d.stops.length, 0);
    const nights = model.days.reduce((n, d) => n + (d.night ? 1 : 0), 0);
    const expected = 1 + stops + nights + (model.end ? 1 : 0);
    expect(expected).toBe(6);
    expect(count(gpx, "<wpt")).toBe(expected);
  });

  test("one <trk> per day", () => {
    expect(count(gpx, "<trk>")).toBe(model.days.length);
  });

  test("total <trkpt count equals the sum of path lengths", () => {
    const expected = model.days.reduce((n, d) => n + d.path.length, 0);
    expect(expected).toBe(5);
    expect(count(gpx, "<trkpt")).toBe(expected);
  });

  test("<wpt> carries lat and lon attributes", () => {
    expect(gpx).toContain('<wpt lat="10" lon="20">');
  });

  test("names containing & and < are escaped", () => {
    expect(gpx).toContain("Start &amp; Go");
    expect(gpx).toContain("Day 1 &amp; &lt;one&gt;");
    expect(gpx).not.toContain("Start & Go");
    expect(gpx).not.toContain("&lt;one>");
  });
});
