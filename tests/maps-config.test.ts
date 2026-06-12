import { test, expect, describe, afterEach } from "bun:test";
import { getMapsConfig } from "@/lib/maps-config";

const KEYS = [
  "GOOGLE_MAPS_BROWSER_KEY",
  "GOOGLE_MAPS_MAP_ID",
  "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY",
  "NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID",
] as const;

const saved: Record<string, string | undefined> = {};
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});
function setEnv(vals: Partial<Record<(typeof KEYS)[number], string>>) {
  for (const k of KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  for (const [k, v] of Object.entries(vals)) process.env[k] = v;
}

describe("getMapsConfig", () => {
  test("prefers the runtime GOOGLE_MAPS_* vars", () => {
    setEnv({
      GOOGLE_MAPS_BROWSER_KEY: "runtime-key",
      GOOGLE_MAPS_MAP_ID: "runtime-map",
      NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: "build-key",
      NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID: "build-map",
    });
    expect(getMapsConfig()).toEqual({ apiKey: "runtime-key", mapId: "runtime-map" });
  });

  test("falls back to NEXT_PUBLIC_* for local dev", () => {
    setEnv({
      NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: "build-key",
      NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID: "build-map",
    });
    expect(getMapsConfig()).toEqual({ apiKey: "build-key", mapId: "build-map" });
  });

  test("defaults: empty key, DEMO_MAP_ID when nothing is set", () => {
    setEnv({});
    expect(getMapsConfig()).toEqual({ apiKey: "", mapId: "DEMO_MAP_ID" });
  });
});
