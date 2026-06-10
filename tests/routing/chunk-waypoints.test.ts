import { test, expect, describe } from "bun:test";
import { chunkWaypoints, type RouteWaypoint } from "@/lib/routing/routes";

function chain(n: number): RouteWaypoint[] {
  return Array.from({ length: n }, (_, i) => ({ lat: 0, lng: i }));
}

describe("chunkWaypoints", () => {
  test("a chain within the limit is one batch", () => {
    const pts = chain(20); // 18 intermediates
    expect(chunkWaypoints(pts, 25)).toEqual([pts]);
  });

  test("splits a 32-waypoint chain (30 intermediates) into shared-boundary batches", () => {
    const pts = chain(32);
    const batches = chunkWaypoints(pts, 25);
    expect(batches.length).toBe(2);
    for (const b of batches) expect(b.length - 2).toBeLessThanOrEqual(25);
    expect(batches[0][batches[0].length - 1]).toEqual(batches[1][0]);
    expect(batches.reduce((s, b) => s + b.length - 1, 0)).toBe(pts.length - 1);
  });

  test("splits on stopover boundaries, never ending a batch on a via", () => {
    const pts = chain(60).map((w, i) => (i % 3 === 0 ? w : { ...w, via: true }));
    const batches = chunkWaypoints(pts, 25);
    for (let i = 0; i < batches.length - 1; i++) {
      const boundary = batches[i][batches[i].length - 1];
      expect(boundary.via).toBeUndefined();
    }
  });

  test("the real destination is the last batch end even when it is a via", () => {
    // 7 points, max=3 → splits; the final destination (index 6) is a via and must
    // NOT be backed away from (the trailing-via fix).
    const pts: RouteWaypoint[] = [
      { lat: 0, lng: 0 }, { lat: 0, lng: 1 }, { lat: 0, lng: 2 },
      { lat: 0, lng: 3 }, { lat: 0, lng: 4 }, { lat: 0, lng: 5 },
      { lat: 0, lng: 6, via: true },
    ];
    const batches = chunkWaypoints(pts, 3);
    const last = batches[batches.length - 1];
    expect(last[last.length - 1]).toEqual(pts[6]); // ends at the true destination
    expect(batches.reduce((s, b) => s + b.length - 1, 0)).toBe(pts.length - 1);
  });
});
