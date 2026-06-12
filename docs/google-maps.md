# Google Maps API keys & required permissions

This app uses **two** Google Maps Platform API keys with different jobs and
different restrictions. Set up both in the [Google Cloud Console](https://console.cloud.google.com/google/maps-apis)
(same project is fine).

> Why two keys: the **browser** key is public (it ships to every visitor) and can
> only be locked by HTTP referrer; the **server** key is secret and locked by IP.
> One key can't carry both restriction models, so keep them separate and give each
> only the APIs it needs (least privilege).

---

## 1. Browser key — `GOOGLE_MAPS_BROWSER_KEY`

Loaded by the client (`@vis.gl/react-google-maps`) to render maps and power
search. Served to the browser at runtime, so it **must** be referrer-restricted.

**Application restriction:** *Websites (HTTP referrers)* — add your domain(s):
- `https://your-host.example.com/*`
- `http://localhost:5001/*` (local dev)

**Enable these APIs:**

| API | Why it's needed | Used in |
|---|---|---|
| **Maps JavaScript API** | The interactive map, Advanced Markers, and the `geometry` / `core` libraries | `trip-map.tsx`, `mobile/companion-map.tsx` |
| **Places API (New)** | Place autocomplete (`AutocompleteSuggestion`) and place details/photos (`Place.fetchFields`) | `place-autocomplete.tsx`, `place-preview.tsx`, `place-info-popup.tsx`, `trip-map.tsx` |
| **Geocoding API** | Client-side reverse geocoding — drop-a-pin on the map → address | `lib/places/reverse-geocode.ts` (via the JS `Geocoder`) |

---

## 2. Server key — `GOOGLE_MAPS_SERVER_KEY`

Used only server-side (route handlers, the MCP server). Never sent to the browser.

**Application restriction:** *IP addresses* — your server's egress IP(s). (Use
*None* only while testing, then lock it down.)

**Enable these APIs:**

| API | Why it's needed | Used in |
|---|---|---|
| **Geocoding API** | Resolve trip start/finish and typed place names → coordinates | `lib/geocode.ts` (`/maps/api/geocode/json`) |
| **Places API (New)** | Server-side place discovery for AI planning (text + nearby search) | `lib/places/search.ts` (`places:searchText`, `places:searchNearby`) |
| **Routes API** | Per-day driving legs — duration & distance between stops | `lib/routing/routes.ts` (`directions/v2:computeRoutes`) |

> **Places API (New)**, not the legacy "Places API" — this app uses the v1
> `places.googleapis.com` endpoints and the new `Place`/`AutocompleteSuggestion`
> classes. You do not need the legacy Places API enabled.

---

## Map ID — `GOOGLE_MAPS_MAP_ID`

Advanced Markers require a **Map ID** (not an API). Create one under
*Google Maps Platform → Map Management*, or use the built-in `DEMO_MAP_ID` for
local dev (the app defaults to it). It is not secret.

## Quick setup checklist

1. Create a Google Cloud project and enable billing (Maps Platform requires it).
2. **Browser key:** enable *Maps JavaScript API*, *Places API (New)*, *Geocoding API*; restrict by HTTP referrer.
3. **Server key:** enable *Geocoding API*, *Places API (New)*, *Routes API*; restrict by IP.
4. (Optional) Create a Map ID for styled maps / Advanced Markers.
5. Set the env vars (see [`.env.example`](../.env.example) and [`docs/deploy.md`](./deploy.md)):
   - `GOOGLE_MAPS_BROWSER_KEY`, `GOOGLE_MAPS_MAP_ID` — runtime, served to the client.
   - `GOOGLE_MAPS_SERVER_KEY` — runtime, server-only.

| Env var | Key | Restriction |
|---|---|---|
| `GOOGLE_MAPS_BROWSER_KEY` | Browser | HTTP referrer |
| `GOOGLE_MAPS_SERVER_KEY` | Server | IP address |
| `GOOGLE_MAPS_MAP_ID` | (Map ID, not a key) | — |
