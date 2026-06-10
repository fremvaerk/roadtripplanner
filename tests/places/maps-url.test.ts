import { test, expect, describe } from "bun:test";
import { googleMapsUrl } from "@/lib/places/maps-url";

describe("googleMapsUrl", () => {
  test("builds a query-by-coordinates link", () => {
    expect(googleMapsUrl(59.9, 10.7)).toBe(
      "https://www.google.com/maps/search/?api=1&query=59.9,10.7",
    );
  });
  test("includes the place id when known", () => {
    expect(googleMapsUrl(59.9, 10.7, "place_123")).toBe(
      "https://www.google.com/maps/search/?api=1&query=59.9,10.7&query_place_id=place_123",
    );
  });
  test("null place id is omitted", () => {
    expect(googleMapsUrl(1, 2, null)).toBe(
      "https://www.google.com/maps/search/?api=1&query=1,2",
    );
  });
});
