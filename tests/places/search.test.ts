import { test, expect, describe, afterEach } from "bun:test";
import { searchPlacesText, searchPlacesNearby, PlaceSearchError } from "@/lib/places/search";

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

describe("searchPlacesNearby", () => {
  test("hits the nearby endpoint with locationRestriction + rankPreference, and normalizes", async () => {
    const { calls } = mockFetch({
      places: [
        {
          displayName: { text: "Höga Kusten" },
          location: { latitude: 62.9, longitude: 18.1 },
          id: "p2",
          types: ["natural_feature"],
          formattedAddress: "Sweden",
        },
      ],
    });

    const results = await searchPlacesNearby({ lat: 62.9, lng: 18.1 }, 5000, { limit: 5 }, "KEY");

    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("Höga Kusten");
    expect(results[0].lat).toBeCloseTo(62.9);
    expect(results[0].lng).toBeCloseTo(18.1);
    expect(results[0].placeId).toBe("p2");

    const { url, init } = calls[0];
    expect(String(url)).toBe("https://places.googleapis.com/v1/places:searchNearby");
    expect(init?.method).toBe("POST");
    const headers = init?.headers as Record<string, string>;
    expect(headers["X-Goog-Api-Key"]).toBe("KEY");
    expect(headers["X-Goog-FieldMask"]).toContain("places.location");
    const body = JSON.parse((init?.body as string) ?? "{}");
    expect(body.locationRestriction.circle.center.latitude).toBe(62.9);
    expect(body.locationRestriction.circle.radius).toBe(5000);
    expect(body.rankPreference).toBe("POPULARITY");
    expect(body.maxResultCount).toBe(5);
  });

  test("forwards includedTypes when given", async () => {
    const { calls } = mockFetch({ places: [] });
    await searchPlacesNearby({ lat: 1, lng: 2 }, 1000, { includedTypes: ["museum"] }, "KEY");
    const body = JSON.parse((calls[0].init?.body as string) ?? "{}");
    expect(body.includedTypes).toEqual(["museum"]);
  });

  test("rejects with PlaceSearchError on non-200", async () => {
    mockFetch({}, false, 500);
    await expect(searchPlacesNearby({ lat: 1, lng: 2 }, 1000, {}, "KEY")).rejects.toBeInstanceOf(
      PlaceSearchError,
    );
  });

  test("rejects when the key is missing and does not call fetch", async () => {
    const { calls } = mockFetch({ places: [] });
    const saved = process.env.GOOGLE_MAPS_SERVER_KEY;
    delete process.env.GOOGLE_MAPS_SERVER_KEY;
    try {
      await expect(searchPlacesNearby({ lat: 1, lng: 2 }, 1000, {}, undefined)).rejects.toBeInstanceOf(
        PlaceSearchError,
      );
      expect(calls).toHaveLength(0);
    } finally {
      if (saved !== undefined) process.env.GOOGLE_MAPS_SERVER_KEY = saved;
    }
  });
});
