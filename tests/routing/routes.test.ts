import { test, expect, describe, afterEach } from "bun:test";
import { computeRoute, RouteError } from "@/lib/routing/routes";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function mockFetch(payload: unknown, ok = true, status = 200) {
  globalThis.fetch = (async () =>
    ({ ok, status, json: async () => payload }) as Response) as typeof fetch;
}

const sample = {
  routes: [
    {
      duration: "3600s",
      distanceMeters: 100000,
      polyline: { encodedPolyline: "abc123" },
      legs: [
        { duration: "1800s", distanceMeters: 40000 },
        { duration: "1800s", distanceMeters: 60000 },
      ],
    },
  ],
};

describe("computeRoute", () => {
  test("returns polyline, legs, and totals on success", async () => {
    mockFetch(sample);
    const r = await computeRoute(
      [
        { lat: 1, lng: 1 },
        { lat: 2, lng: 2 },
        { lat: 3, lng: 3 },
      ],
      "fake-key",
    );
    expect(r.encodedPolyline).toBe("abc123");
    expect(r.totalDurationSeconds).toBe(3600);
    expect(r.totalDistanceMeters).toBe(100000);
    expect(r.legs.map((l) => l.durationSeconds)).toEqual([1800, 1800]);
    expect(r.legs.map((l) => l.distanceMeters)).toEqual([40000, 60000]);
  });

  test("throws RouteError when fewer than 2 points", async () => {
    await expect(computeRoute([{ lat: 1, lng: 1 }], "fake-key")).rejects.toBeInstanceOf(RouteError);
  });

  test("throws RouteError on HTTP failure", async () => {
    mockFetch({}, false, 500);
    await expect(
      computeRoute([{ lat: 1, lng: 1 }, { lat: 2, lng: 2 }], "fake-key"),
    ).rejects.toBeInstanceOf(RouteError);
  });

  test("throws RouteError when no route is returned", async () => {
    mockFetch({ routes: [] });
    await expect(
      computeRoute([{ lat: 1, lng: 1 }, { lat: 2, lng: 2 }], "fake-key"),
    ).rejects.toBeInstanceOf(RouteError);
  });

  test("throws RouteError when the API key is missing", async () => {
    await expect(
      computeRoute([{ lat: 1, lng: 1 }, { lat: 2, lng: 2 }], ""),
    ).rejects.toBeInstanceOf(RouteError);
  });

  test("requests optimization and returns the optimized intermediate order", async () => {
    let captured: { body: string; fieldMask: string } | null = null;
    globalThis.fetch = (async (_url: string, init: RequestInit) => {
      captured = {
        body: String(init.body),
        fieldMask: (init.headers as Record<string, string>)["X-Goog-FieldMask"],
      };
      return {
        ok: true,
        status: 200,
        json: async () => ({
          routes: [
            {
              duration: "100s",
              distanceMeters: 1000,
              polyline: { encodedPolyline: "p" },
              legs: [{ duration: "100s", distanceMeters: 1000 }],
              optimizedIntermediateWaypointIndex: [1, 0],
            },
          ],
        }),
      } as Response;
    }) as typeof fetch;

    const r = await computeRoute(
      [
        { lat: 0, lng: 0 },
        { lat: 1, lng: 1 },
        { lat: 2, lng: 2 },
        { lat: 3, lng: 3 },
      ],
      "fake-key",
      { optimize: true },
    );
    expect(r.optimizedOrder).toEqual([1, 0]);
    expect(captured!.body).toContain("\"optimizeWaypointOrder\":true");
    expect(captured!.fieldMask).toContain("routes.optimizedIntermediateWaypointIndex");
  });

  test("marks via intermediates as via:true and requests leg polylines", async () => {
    let body = "";
    let fieldMask = "";
    globalThis.fetch = (async (_url: string, init: RequestInit) => {
      body = String(init.body);
      fieldMask = (init.headers as Record<string, string>)["X-Goog-FieldMask"];
      return {
        ok: true,
        status: 200,
        json: async () => ({
          routes: [
            {
              duration: "100s",
              distanceMeters: 1000,
              polyline: { encodedPolyline: "p" },
              legs: [
                { duration: "100s", distanceMeters: 1000, polyline: { encodedPolyline: "leg0" } },
              ],
            },
          ],
        }),
      } as Response;
    }) as typeof fetch;

    const r = await computeRoute(
      [
        { lat: 0, lng: 0 },
        { lat: 1, lng: 1, via: true },
        { lat: 2, lng: 2 },
      ],
      "fake-key",
      { legPolylines: true },
    );
    expect(body).toContain("\"via\":true");
    expect(fieldMask).toContain("routes.legs.polyline.encodedPolyline");
    expect(r.legs[0].encodedPolyline).toBe("leg0");
  });
});
