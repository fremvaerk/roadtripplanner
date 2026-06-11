import { test, expect, describe } from "bun:test";
import { buildKml, kmlColor, esc } from "@/lib/export/kml";
import type { ExportModel } from "@/lib/export/itinerary-model";

function model(overrides: Partial<ExportModel> = {}): ExportModel {
  return {
    title: "My Trip",
    start: { lat: 1, lng: 2, name: "Home" },
    end: { lat: 3, lng: 4, name: "Away" },
    days: [
      {
        index: 0,
        label: "Day 1",
        color: "#16a34a",
        stops: [
          {
            lat: 10,
            lng: 20,
            name: "A & B <x>",
            category: "Park",
            address: "1 Road",
            imageUrl: "http://x/y.jpg",
          },
        ],
        night: { lat: 11, lng: 21, name: "Hotel" },
        path: [
          { lat: 5, lng: 6 },
          { lat: 7, lng: 8 },
        ],
      },
      {
        index: 1,
        label: "Day 2",
        color: "#000000",
        stops: [],
        night: null,
        path: [],
      },
    ],
    ...overrides,
  };
}

describe("buildKml", () => {
  test("starts with xml declaration and contains kml root", () => {
    const out = buildKml(model());
    expect(out.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(out).toContain("<kml");
  });

  test("one Folder per day", () => {
    const m = model();
    const out = buildKml(m);
    const count = (out.match(/<Folder/g) ?? []).length;
    expect(count).toBe(m.days.length);
  });

  test("straight-line fallback (empty path) starts at the day's origin", () => {
    const m = model({
      days: [
        {
          index: 0,
          label: "Day 1",
          color: "#16a34a",
          origin: { lat: 100, lng: 200, name: "Origin" },
          stops: [{ lat: 10, lng: 20, name: "Stop" }],
          night: { lat: 11, lng: 21, name: "Hotel" },
          path: [],
        },
      ],
    });
    const out = buildKml(m);
    // the LineString coordinates (not the start Placemark's point)
    const coords = out.match(/<LineString>.*?<coordinates>([^<]*)<\/coordinates>/)?.[1] ?? "";
    // origin first (lng,lat,0), then stop, then night
    expect(coords).toBe("200,100,0 20,10,0 21,11,0");
  });

  test("has start Placemark and end Placemark when end set", () => {
    const out = buildKml(model());
    expect(out).toContain("Start:");
    expect(out).toContain("End:");
  });

  test("no end Placemark when end is null", () => {
    const out = buildKml(model({ end: null }));
    expect(out).not.toContain("End:");
  });

  test("escapes stop name", () => {
    const out = buildKml(model());
    expect(out).toContain("<name>A &amp; B &lt;x&gt;</name>");
  });

  test("coordinate order is lng,lat", () => {
    const out = buildKml(model());
    expect(out).toContain("20,10,0");
    expect(out).not.toContain("10,20,0");
  });

  test("kmlColor converts to aabbggrr", () => {
    expect(kmlColor("#16a34a")).toBe("ff4aa316");
    const out = buildKml(model());
    expect(out).toContain("<color>ff4aa316</color>");
  });

  test("imageUrl yields img tag within description", () => {
    const out = buildKml(model());
    expect(out).toContain("<img");
    const descMatch = out.match(/<description>[\s\S]*?<\/description>/);
    expect(descMatch).not.toBeNull();
    expect(descMatch![0]).toContain("http://x/y.jpg");
    expect(descMatch![0]).toContain("<img");
  });

  test("LineString uses the day path coordinates when path non-empty", () => {
    const out = buildKml(model());
    expect(out).toContain("<LineString>");
    expect(out).toContain("<coordinates>6,5,0 8,7,0</coordinates>");
  });

  test("esc escapes all five entities", () => {
    expect(esc(`& < > " '`)).toBe("&amp; &lt; &gt; &quot; &apos;");
  });
});
