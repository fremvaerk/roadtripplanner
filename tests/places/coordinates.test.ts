import { test, expect, describe } from "bun:test";
import { parseCoordinates } from "@/lib/places/coordinates";

describe("parseCoordinates — decimal", () => {
  test("comma, comma+space, and whitespace separators", () => {
    expect(parseCoordinates("67.2335,14.6212")).toEqual({ lat: 67.2335, lng: 14.6212 });
    expect(parseCoordinates("67.2335, 14.6212")).toEqual({ lat: 67.2335, lng: 14.6212 });
    expect(parseCoordinates("67.2335 14.6212")).toEqual({ lat: 67.2335, lng: 14.6212 });
  });

  test("negatives and surrounding whitespace", () => {
    expect(parseCoordinates("  -33.86, 151.21 ")).toEqual({ lat: -33.86, lng: 151.21 });
  });

  test("rejects non-coordinates and out-of-range", () => {
    expect(parseCoordinates("Oslo")).toBeNull();
    expect(parseCoordinates("67.2335")).toBeNull();
    expect(parseCoordinates("1,2,3")).toBeNull();
    expect(parseCoordinates("Route 66")).toBeNull();
    expect(parseCoordinates("200, 14")).toBeNull();
    expect(parseCoordinates("10, 200")).toBeNull();
  });
});

describe("parseCoordinates — DMS", () => {
  test("straight-quote DMS with prefix hemispheres", () => {
    const r = parseCoordinates(`N 59°53'52.6668" E 17°38'7.5552"`);
    expect(r).not.toBeNull();
    expect(r!.lat).toBeCloseTo(59.898, 3);
    expect(r!.lng).toBeCloseTo(17.6354, 3);
  });

  test("typographic-quote DMS (as Google Maps shows it)", () => {
    const r = parseCoordinates(`N 59°53’52.6668” E 17°38’7.5552”`);
    expect(r).not.toBeNull();
    expect(r!.lat).toBeCloseTo(59.898, 3);
    expect(r!.lng).toBeCloseTo(17.6354, 3);
  });

  test("suffix hemispheres", () => {
    const r = parseCoordinates(`59°53'52.7"N 17°38'7.6"E`);
    expect(r!.lat).toBeCloseTo(59.898, 3);
    expect(r!.lng).toBeCloseTo(17.6354, 3);
  });

  test("S/W negate; seconds may be omitted", () => {
    const r = parseCoordinates(`S 33°51' E 151°12'`);
    expect(r!.lat).toBeCloseTo(-33.85, 2);
    expect(r!.lng).toBeCloseTo(151.2, 2);
  });

  test("hemispheres make order not matter (lng given first)", () => {
    const r = parseCoordinates(`E 17°38'7.5552" N 59°53'52.6668"`);
    expect(r!.lat).toBeCloseTo(59.898, 3);
    expect(r!.lng).toBeCloseTo(17.6354, 3);
  });

  test("rejects a single DMS component", () => {
    expect(parseCoordinates(`N 59°53'52.6668"`)).toBeNull();
  });
});
