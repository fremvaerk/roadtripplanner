// Google Maps *browser* config, resolved at request time on the server so it can
// be set as runtime env (one image → many environments, rotate without a rebuild)
// instead of being inlined into the client bundle via NEXT_PUBLIC_* at build time.
//
// The browser key is public by nature (it ships to every visitor and is secured
// by HTTP-referrer restriction, not secrecy) — so delivering it in the
// server-rendered HTML is no different in exposure from the old NEXT_PUBLIC_ build.
//
// Read this in a Server Component (it's request-time on dynamic routes) and pass
// the result to <MapsConfigProvider>. NEXT_PUBLIC_* remain as a local-dev fallback.

export type MapsConfig = { apiKey: string; mapId: string };

export function getMapsConfig(): MapsConfig {
  return {
    apiKey:
      process.env.GOOGLE_MAPS_BROWSER_KEY ??
      process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ??
      "",
    mapId:
      process.env.GOOGLE_MAPS_MAP_ID ??
      process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID ??
      "DEMO_MAP_ID",
  };
}
