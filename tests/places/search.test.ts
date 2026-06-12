import { test, expect, describe, afterEach } from "bun:test";
import { searchPlacesText, PlaceSearchError } from "@/lib/places/search";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

type FetchArgs = { url: unknown; init: RequestInit | undefined };

function mockFetch(
  payload: unknown,
  ok = true,
  status = 200,
): { calls: FetchArgs[] } {
  const calls: FetchArgs[] = [];
  globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
    calls.push({ url, init });
    return { ok, status, json: async () => payload } as Response;
  }) as typeof fetch;
  return { calls };
}

describe("searchPlacesText", () => {
  test("normalizes a successful response and sends the right request", async () => {
    const { calls } = mockFetch({
      places: [
        {
          displayName: { text: "Gammelstad" },
          location: { latitude: 65.6, longitude: 22.0 },
          id: "p1",
          types: ["tourist_attraction"],
          formattedAddress: "Luleå",
        },
      ],
    });

    const results = await searchPlacesText("x", {}, "KEY");

    expect(results).toHaveLength(1);
    const r = results[0];
    expect(r.name).toBe("Gammelstad");
    expect(r.lat).toBeCloseTo(65.6);
    expect(r.lng).toBeCloseTo(22.0);
    expect(r.placeId).toBe("p1");
    expect(r.address).toBe("Luleå");
    expect(r.category).not.toBeUndefined();
    expect(r.category).not.toBeNull();
    expect(r.types).not.toBeUndefined();
    expect(r.types).toEqual(["tourist_attraction"]);

    // Inspect the captured request.
    expect(calls).toHaveLength(1);
    const { url, init } = calls[0];
    expect(String(url)).toBe("https://places.googleapis.com/v1/places:searchText");
    expect(init?.method).toBe("POST");
    const headers = init?.headers as Record<string, string>;
    expect(headers["X-Goog-Api-Key"]).toBe("KEY");
    expect(headers["X-Goog-FieldMask"]).toContain("places.displayName");
    expect(headers["X-Goog-FieldMask"]).toContain("places.location");
  });

  test("includes locationBias when near is provided", async () => {
    const { calls } = mockFetch({ places: [] });

    await searchPlacesText("x", { near: { lat: 1, lng: 2 }, radiusMeters: 1000 }, "KEY");

    const body = JSON.parse((calls[0].init?.body as string) ?? "{}");
    expect(body.locationBias.circle.center.latitude).toBe(1);
    expect(body.locationBias.circle.center.longitude).toBe(2);
    expect(body.locationBias.circle.radius).toBe(1000);
  });

  test("rejects with PlaceSearchError on non-200", async () => {
    mockFetch({}, false, 403);
    await expect(searchPlacesText("x", {}, "KEY")).rejects.toBeInstanceOf(PlaceSearchError);
  });

  test("rejects with PlaceSearchError when the key is missing and does not call fetch", async () => {
    const { calls } = mockFetch({ places: [] });
    // `undefined` explicitly triggers the default-parameter env fallback, so
    // also clear the env var to simulate a genuinely missing key.
    const saved = process.env.GOOGLE_MAPS_SERVER_KEY;
    delete process.env.GOOGLE_MAPS_SERVER_KEY;
    try {
      await expect(searchPlacesText("x", {}, undefined)).rejects.toBeInstanceOf(PlaceSearchError);
      expect(calls).toHaveLength(0);
    } finally {
      if (saved !== undefined) process.env.GOOGLE_MAPS_SERVER_KEY = saved;
    }
  });
});
