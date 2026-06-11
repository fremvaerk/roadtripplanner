import { test, expect, describe } from "bun:test";
import { dayDirectionsUrl } from "@/lib/export/maps-links";
import type { ExportModel, ExportDay, ExportPoint, ExportPlace } from "@/lib/export/itinerary-model";

const pt = (lat: number, lng: number, name: string): ExportPoint => ({ lat, lng, name });
const place = (lat: number, lng: number, name: string): ExportPlace => ({ lat, lng, name });

const day = (over: Partial<ExportDay>): ExportDay => ({
  index: 0,
  label: "Day",
  color: "#000",
  stops: [],
  night: null,
  path: [],
  ...over,
});

const model = (over: Partial<ExportModel>): ExportModel => ({
  title: "Trip",
  start: pt(10, 20, "Start"),
  end: null,
  days: [],
  ...over,
});

describe("dayDirectionsUrl", () => {
  test("day 0: origin = model.start, stops [A,B], night N", () => {
    const start = pt(10, 20, "Start");
    const A = place(1, 2, "A");
    const B = place(3, 4, "B");
    const N = pt(5, 6, "N");
    const m = model({ start, days: [day({ stops: [A, B], night: N })] });

    const { url, truncated } = dayDirectionsUrl(m, 0);
    expect(url).toContain("origin=10,20");
    expect(url).toContain("destination=5,6");
    expect(url).toContain("waypoints=1,2|3,4");
    expect(url).toContain("travelmode=driving");
    expect(truncated).toBe(false);
  });

  test("day i>0: origin = previous day's night", () => {
    const prevNight = pt(7, 8, "PrevNight");
    const A = place(1, 2, "A");
    const N = pt(5, 6, "N");
    const m = model({
      days: [day({ index: 0, night: prevNight }), day({ index: 1, stops: [A], night: N })],
    });

    const { url } = dayDirectionsUrl(m, 1);
    expect(url).toContain("origin=7,8");
    expect(url).toContain("destination=5,6");
  });

  test("day i>0: origin falls back to model.start when previous night is null", () => {
    const start = pt(10, 20, "Start");
    const A = place(1, 2, "A");
    const N = pt(5, 6, "N");
    const m = model({
      start,
      days: [day({ index: 0, night: null }), day({ index: 1, stops: [A], night: N })],
    });

    const { url } = dayDirectionsUrl(m, 1);
    expect(url).toContain("origin=10,20");
  });

  test("only a night, no stops: no waypoints segment (mid empty)", () => {
    const start = pt(10, 20, "Start");
    const N = pt(5, 6, "N");
    const m = model({ start, days: [day({ stops: [], night: N })] });

    const { url } = dayDirectionsUrl(m, 0);
    expect(url).not.toContain("waypoints=");
    expect(url).toContain("origin=10,20");
    expect(url).toContain("destination=5,6");
  });

  test("no night: destination = last stop, remaining stops are waypoints", () => {
    const start = pt(10, 20, "Start");
    const A = place(1, 2, "A");
    const B = place(3, 4, "B");
    const C = place(5, 6, "C");
    const m = model({ start, days: [day({ stops: [A, B, C], night: null })] });

    const { url } = dayDirectionsUrl(m, 0);
    expect(url).toContain("origin=10,20");
    expect(url).toContain("destination=5,6");
    expect(url).toContain("waypoints=1,2|3,4");
  });

  test("truncated true and only first 9 waypoints when >9 in-between stops", () => {
    const start = pt(0, 0, "Start");
    const stops: ExportPlace[] = [];
    for (let k = 1; k <= 11; k++) stops.push(place(k, k, `S${k}`));
    const N = pt(99, 99, "N");
    const m = model({ start, days: [day({ stops, night: N })] });

    const { url, truncated } = dayDirectionsUrl(m, 0);
    expect(truncated).toBe(true);

    const match = url.match(/waypoints=([^&]+)/);
    expect(match).not.toBeNull();
    const wp = match![1];
    // 9 lat,lng pairs => 9 commas, 8 pipe separators
    expect((wp.match(/,/g) || []).length).toBe(9);
    expect((wp.match(/\|/g) || []).length).toBe(8);
    // first nine stops kept, tenth absent
    expect(wp).toContain("9,9");
    expect(wp).not.toContain("10,10");
  });

  test("coordinates are formatted lat,lng (lat first)", () => {
    const start = pt(11, 22, "Start");
    const N = pt(33, 44, "N");
    const m = model({ start, days: [day({ stops: [], night: N })] });

    const { url } = dayDirectionsUrl(m, 0);
    expect(url).toContain("origin=11,22");
    expect(url).toContain("destination=33,44");
  });
});
