import { test, expect, describe, afterEach } from "bun:test";
import { geocodePlace, GeocodeError } from "@/lib/geocode";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function mockFetch(payload: unknown, ok = true, status = 200) {
  globalThis.fetch = (async () =>
    ({ ok, status, json: async () => payload }) as Response) as typeof fetch;
}

describe("geocodePlace", () => {
  test("returns a resolved location on OK", async () => {
    mockFetch({
      status: "OK",
      results: [
        {
          formatted_address: "Florence, Metropolitan City of Florence, Italy",
          place_id: "ChIJrdbSgKZWKhMRAyrH7xd51ZM",
          geometry: { location: { lat: 43.7696, lng: 11.2558 } },
        },
      ],
    });
    const r = await geocodePlace("Florence", "fake-key");
    expect(r.lat).toBeCloseTo(43.7696);
    expect(r.lng).toBeCloseTo(11.2558);
    expect(r.placeId).toBe("ChIJrdbSgKZWKhMRAyrH7xd51ZM");
    expect(r.name).toContain("Florence");
  });

  test("throws GeocodeError on ZERO_RESULTS", async () => {
    mockFetch({ status: "ZERO_RESULTS", results: [] });
    await expect(geocodePlace("asdfqwer", "fake-key")).rejects.toBeInstanceOf(GeocodeError);
  });

  test("throws GeocodeError on HTTP failure", async () => {
    mockFetch({}, false, 500);
    await expect(geocodePlace("Florence", "fake-key")).rejects.toBeInstanceOf(GeocodeError);
  });

  test("throws GeocodeError when the API key is an empty string", async () => {
    await expect(geocodePlace("Florence", "")).rejects.toBeInstanceOf(GeocodeError);
  });

  test("throws GeocodeError when no key is set (default arg, missing env)", async () => {
    const saved = process.env.GOOGLE_MAPS_SERVER_KEY;
    delete process.env.GOOGLE_MAPS_SERVER_KEY;
    try {
      await expect(geocodePlace("Florence")).rejects.toBeInstanceOf(GeocodeError);
    } finally {
      if (saved !== undefined) process.env.GOOGLE_MAPS_SERVER_KEY = saved;
    }
  });
});
