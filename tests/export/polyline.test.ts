import { test, expect, describe } from "bun:test";
import { decodePolyline } from "@/lib/export/polyline";

describe("decodePolyline", () => {
  test("decodes the canonical Google example", () => {
    const pts = decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@");
    expect(pts.length).toBe(3);
    const approx = pts.map((p) => [Number(p.lat.toFixed(3)), Number(p.lng.toFixed(3))]);
    expect(approx).toEqual([
      [38.5, -120.2],
      [40.7, -120.95],
      [43.252, -126.453],
    ]);
  });
  test("empty string decodes to no points", () => {
    expect(decodePolyline("")).toEqual([]);
  });
});
