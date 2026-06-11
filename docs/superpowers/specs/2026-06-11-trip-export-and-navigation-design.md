# Trip Export & Navigation — Design

**Goal:** Let the user navigate and save a planned trip outside the app, three ways: per-day **Google Maps** turn-by-turn links, a **KML** file for Google My Maps, and a **GPX** file for offline nav apps / GPS devices.

## Context

There is no public Google My Maps write API (and Drive can't create `application/vnd.google-apps.map` files), so "push into My Maps" is impossible. The supported path is a downloadable **KML** the user imports manually. For actual turn-by-turn we use **Google Maps directions deep links** (per day, so each fits Google's ~9-stop limit). **GPX** covers offline/GPS apps.

All three serialize the same ordered itinerary, so the design is **one shared model + three thin serializers**, all pure and unit-tested. Files build client-side from the already-cached trip + route (no new API endpoint).

## Shared export model (`lib/export/`)

`buildExportModel(trip: TripDetail, route: RouteResult | undefined): ExportModel`

```ts
type ExportPoint = { lat: number; lng: number; name: string };
type ExportPlace = ExportPoint & { category?: string | null; address?: string | null; imageUrl?: string | null };
type ExportDay = {
  index: number;        // 0-based dayIndex
  label: string;        // "Day 1 · Fri 12 Jun" (date omitted if no startDate)
  color: string;        // hex, day.color ?? defaultDayColor(index)
  stops: ExportPlace[]; // day.pois sorted by orderInDay
  night: ExportPoint | null;
  path: { lat: number; lng: number }[]; // decoded road geometry for the day
};
type ExportModel = { title: string; start: ExportPoint; end: ExportPoint | null; days: ExportDay[] };
```

- **start** = `{ startLat, startLng, startName }`. **end** = `{ endLat, endLng, endName }` when set, else `start` when `isRoundTrip`, else `null`.
- **per-day `path`** = decode every `route.leg` whose `dayId === day.id` (in array order) and concatenate, dropping the duplicate seam point between consecutive legs. If the route has no legs for the day (route not built), `path` is empty — serializers fall back to straight segments through `[origin, …stops, night]`.
- **polyline decode** = `decodePolyline(encoded)` (standard Google algorithm, 1e-5 precision) in `lib/export/polyline.ts`, so exports don't depend on Google's JS lib being loaded.

## Serializers

1. **`maps-links.ts` → `dayDirectionsUrl(model, i): { url: string; truncated: boolean }`**
   Nav sequence for day `i` = `[origin, …stops, night?]` where `origin` = trip start for day 0, else the previous day's night (falling back to start if that day had none). `origin` = first, `destination` = last, the rest are `waypoints`. URL: `https://www.google.com/maps/dir/?api=1&origin=LAT,LNG&destination=LAT,LNG&waypoints=LAT,LNG|…&travelmode=driving`. `truncated: true` when waypoints > 9 (URL keeps the first 9; UI warns).

2. **`kml.ts` → `buildKml(model): string`**
   `<Document>` with the trip title; a `<Placemark>` for start and (if present) end; one `<Folder>` per day (→ a My Maps layer) named by `label`, containing: a colored route `<LineString>` (from `path`, or straight segments fallback), a `<Placemark>`/`<Point>` per stop (name; description carries category + address + an `<img>` when `imageUrl` is set), and a night `<Placemark>`. Per-day `<Style>` `LineStyle` color = day color as KML `aabbggrr`. All text XML-escaped; coordinates `lng,lat,0`.

3. **`gpx.ts` → `buildGpx(model): string`**
   GPX 1.1: a `<wpt>` for start, each stop, each night, and end (with `<name>`); one `<trk>` per day (`<name>` = label) with a `<trkseg>` of `<trkpt>` from `path` (or straight fallback).

## UI (`components/planner-shell.tsx` + a small helper)

- **Per day:** a `▸ Navigate` link in the day header (next to the 🚗 badge) → `window.open(dayDirectionsUrl(...).url)`. If `truncated`, show a subtle title/tooltip noting only the first 9 stops are included.
- **Whole trip:** at the bottom of the Days section, two buttons — **Download KML (My Maps)** and **Download GPX** — calling a tiny `downloadText(filename, mime, text)` helper (`lib/export/download.ts`: Blob + object URL + temp `<a>`). Filenames from a slugified trip title (`my-trip.kml` / `.gpx`).

## Testing

Pure unit tests for: `decodePolyline` (known vector), `buildExportModel` (ordering, color/label, path concat + seam-dedup, straight-line fallback, round-trip/open/place end), `dayDirectionsUrl` (origin/dest/waypoints selection, >9 truncation, day-0 start origin), `buildKml` (folder per day, escaping, color conversion, img in description, coord order lng,lat), `buildGpx` (wpt + trk/trkseg counts, escaping). The download helper and JSX wiring are thin glue, verified by a live smoke test (download a KML, confirm it imports into My Maps; tap a per-day Navigate link).

## Out of scope

Writing directly into My Maps (no API). Auto-sync (re-export to update). Editing the route inside the export.
