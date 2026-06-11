# Trip Export & Navigation — Implementation Plan

> **For agentic workers:** Execute task-by-task with TDD. Pure builders live in `lib/export/`; each has unit tests in `tests/export/`. Do NOT run `bunx prettier --write` on `components/planner-shell.tsx` or other large files — this repo has no prettier config and prettier reflows them into huge diffs. Match surrounding style by hand. When a subagent commits, stage only the files it changed (never `git add -A`).

**Goal:** Per-day Google Maps navigation links + KML (My Maps) + GPX exports of a trip.

**Tech:** Bun, Next.js, React 19, TanStack Query. Tooling: `bun run build`, `bun run test`. Pure functions over a shared `ExportModel`.

**Types** (define in `lib/export/itinerary-model.ts`, import elsewhere):
```ts
export type ExportPoint = { lat: number; lng: number; name: string };
export type ExportPlace = ExportPoint & { category?: string | null; address?: string | null; imageUrl?: string | null };
export type ExportDay = { index: number; label: string; color: string; stops: ExportPlace[]; night: ExportPoint | null; path: { lat: number; lng: number }[] };
export type ExportModel = { title: string; start: ExportPoint; end: ExportPoint | null; days: ExportDay[] };
```

---

### Task 1: polyline decoder

**Files:** Create `lib/export/polyline.ts`, `tests/export/polyline.test.ts`.

- [ ] Test first (`tests/export/polyline.test.ts`): the canonical Google example `"_p~iF~ps|U_ulLnnqC_mqNvxq`@"` decodes to `[[38.5,-120.2],[40.7,-120.95],[43.252,-126.453]]` (lat,lng, tolerance 1e-3). Also: empty string → `[]`.
- [ ] Implement `export function decodePolyline(encoded: string): { lat: number; lng: number }[]` — standard algorithm: iterate chars, accumulate 5-bit chunks into `result`, apply `(result & 1) ? ~(result >> 1) : (result >> 1)`, scale by 1e-5, accumulate lat then lng. Return `{lat,lng}` array.
- [ ] `bun run test tests/export/polyline.test.ts` passes. Commit (`git add lib/export/polyline.ts tests/export/polyline.test.ts`).

---

### Task 2: export model builder

**Files:** Create `lib/export/itinerary-model.ts`, `tests/export/itinerary-model.test.ts`. Imports: `decodePolyline` from `./polyline`, `defaultDayColor` from `@/lib/places/group-colors`, `dayDate` from `@/lib/dates`, types from `@/lib/api/trips`.

Reference data shapes: `TripDetail { title, startName, startLat, startLng, endName, endLat, endLng, isRoundTrip, startDate, days: DayDetail[], pois }`; `DayDetail { id, dayIndex, color, pois: PoiDetail[], night: DayNight|null }`; `DayNight { lat, lng, title }`; `PoiDetail { name, lat, lng, category, address, imageUrl, orderInDay }`; `RouteResult { legs: { encodedPolyline: string|null; dayId: string|null; afterPoiId: string|null }[] }`.

- [ ] Tests: ordering by dayIndex; `label` = `"Day N"` when no startDate else `"Day N · <short date>"` (use the same date formatting approach as `lib/dates.ts`; assert it contains "Day 1"); `color` = `day.color ?? defaultDayColor(index)`; `stops` = `day.pois` sorted by `orderInDay`; `path` concatenates decoded legs for that day's id and drops the seam duplicate (give a route with two legs sharing an endpoint, assert no consecutive duplicate point); empty route → `path: []`; `end` = place when endLat set, else start when `isRoundTrip`, else null.
- [ ] Implement `export function buildExportModel(trip: TripDetail, route?: { legs: { encodedPolyline: string|null; dayId: string|null }[] }): ExportModel`:
  - `start = { lat: trip.startLat, lng: trip.startLng, name: trip.startName }`.
  - `end = trip.endLat != null && trip.endLng != null ? { lat: trip.endLat, lng: trip.endLng, name: trip.endName ?? "End" } : trip.isRoundTrip ? { ...start } : null`.
  - days sorted by `dayIndex`; for each: `stops = [...day.pois].sort((a,b)=>(a.orderInDay??0)-(b.orderInDay??0)).map(p => ({lat,lng,name,category,address,imageUrl}))`; `night = day.night ? {lat,lng,name: day.night.title ?? "Night stop"} : null`; `label` via a local `dayLabel(trip.startDate, dayIndex)`; `color = day.color ?? defaultDayColor(dayIndex)`.
  - `path`: `const coords = []; for (const leg of route?.legs ?? []) { if (leg.dayId !== day.id || !leg.encodedPolyline) continue; for (const pt of decodePolyline(leg.encodedPolyline)) { const last = coords[coords.length-1]; if (last && last.lat === pt.lat && last.lng === pt.lng) continue; coords.push(pt); } }`.
- [ ] Tests pass; build OK. Commit.

---

### Task 3: Google Maps per-day links

**Files:** Create `lib/export/maps-links.ts`, `tests/export/maps-links.test.ts`.

- [ ] Tests: day 0 origin = model.start; day i>0 origin = `days[i-1].night` (or model.start if that night is null); destination = the day's `night` (or last stop if no night); waypoints = the in-between stops; URL shape `https://www.google.com/maps/dir/?api=1&origin=LAT,LNG&destination=LAT,LNG&waypoints=LAT,LNG|LAT,LNG&travelmode=driving`; `truncated:true` and only first 9 waypoints kept when there are >9 waypoints; a day with a single stop and a night → no waypoints; coordinates formatted as `lat,lng` (use the raw numbers, no rounding needed).
- [ ] Implement `export function dayDirectionsUrl(model: ExportModel, i: number): { url: string; truncated: boolean }`:
  - Build `seq: ExportPoint[] = [origin, ...stops, ...(night ? [night] : [])]` where `origin = i === 0 ? model.start : (model.days[i-1].night ?? model.start)`, `stops = model.days[i].stops`, `night = model.days[i].night`.
  - `origin = seq[0]`, `destination = seq[seq.length-1]`, `mid = seq.slice(1, -1)`.
  - `truncated = mid.length > 9`; `waypoints = mid.slice(0, 9)`.
  - `const ll = (p) => \`${p.lat},${p.lng}\``; assemble URLSearchParams-style but keep `|` between waypoints unencoded (build the string manually: `waypoints=${waypoints.map(ll).join("|")}`). Compose the full URL.
  - If `seq.length < 2` (no real route) still return a URL with origin=destination (harmless) and `truncated:false`.
- [ ] Tests pass. Commit.

---

### Task 4: KML serializer

**Files:** Create `lib/export/kml.ts`, `tests/export/kml.test.ts`.

- [ ] Tests: output starts with `<?xml` and contains `<kml`; one `<Folder>` per day; a `<Placemark>` for start and (when present) end; per stop a `<Point><coordinates>lng,lat,0</coordinates>` (assert lng comes before lat); the day `<LineString>` present when `path` non-empty; XML-escaping (a stop named `A & B <x>` appears escaped as `A &amp; B &lt;x&gt;`); color conversion: day color `#16a34a` → KML `ff4aa316` (aabbggrr, alpha ff); a stop with `imageUrl` puts an `<img` in its `<description>`.
- [ ] Implement helpers: `esc(s)` (`& < > " '` → entities); `kmlColor(hex)` → `"ff" + bb + gg + rr` from `#rrggbb`; `coordsLine(points)` → `points.map(p=>\`${p.lng},${p.lat},0\`).join(" ")`.
- [ ] Implement `export function buildKml(model: ExportModel): string`:
  - `<Document><name>esc(title)</name>`, then per day a `<Style id="day{index}">` with `<LineStyle><color>kmlColor</color><width>4</width>`.
  - start `<Placemark><name>Start: …</name><Point>…</Point>`; end likewise when set.
  - per day a `<Folder><name>esc(label)</name>`: route `<Placemark><styleUrl>#day{index}</styleUrl><LineString><tessellate>1</tessellate><coordinates>…</coordinates></LineString></Placemark>` using `path` if non-empty else straight segments through `[origin?, ...stops, night?]` (origin omitted is fine — just the day's own points: `[...stops, night?]`); a `<Placemark>` per stop (`<description>` = escaped category/address plus `<img src="…"/>` when imageUrl — wrap description in `<![CDATA[ … ]]>`); a night `<Placemark>` when present.
  - Close folders/document/kml.
- [ ] Tests pass; build OK. Commit.

---

### Task 5: GPX serializer

**Files:** Create `lib/export/gpx.ts`, `tests/export/gpx.test.ts`.

- [ ] Tests: starts with `<?xml`, contains `<gpx`; a `<wpt lat=".." lon="..">` for start, each stop, each night, and end (assert total count = 1 + sum(stops) + sum(nights) + (end?1:0)); one `<trk>` per day with a `<trkseg>`; `<trkpt>` count for a day equals its `path` length (when non-empty); XML escaping of names.
- [ ] Implement `export function buildGpx(model: ExportModel): string` (reuse an `esc`; GPX uses `lat`/`lon` attributes and child `<name>`). `<gpx version="1.1" creator="RoadTripPlanner" xmlns="http://www.topografix.com/GPX/1/1">`. Waypoints first, then one `<trk>` per day: `<name>esc(label)</name><trkseg>` of `<trkpt lat lon/>` from `path` (or straight `[...stops, night?]` when path empty).
- [ ] Tests pass. Commit.

---

### Task 6: download helper + UI wiring

**Files:** Create `lib/export/download.ts`; modify `components/planner-shell.tsx` (BY HAND, no prettier).

- [ ] `lib/export/download.ts`: `export function downloadText(filename: string, mime: string, text: string)` — create a `Blob([text], {type: mime})`, `URL.createObjectURL`, a temporary `<a download=filename href=url>`, `.click()`, then revoke. Also `export function slugify(s: string): string` → lowercased, non-alnum → `-`, collapse/trim dashes, fallback `"trip"`.
- [ ] In `planner-shell.tsx`:
  - Imports: `buildExportModel` from `@/lib/export/itinerary-model`, `dayDirectionsUrl` from `@/lib/export/maps-links`, `buildKml` from `@/lib/export/kml`, `buildGpx` from `@/lib/export/gpx`, `downloadText, slugify` from `@/lib/export/download`.
  - Compute `const exportModel = useMemo(() => buildExportModel(trip, route), [trip, route]);` (the component already has `trip` and `route`).
  - **Per-day Navigate link:** in the day header's right-side `<span>` (where the 🚗 badge / Optimize / ✕ live), add before the ✕ a link: compute `const nav = dayDirectionsUrl(exportModel, i);` (the day map already exposes index `i`) and render `<a href={nav.url} target="_blank" rel="noreferrer" className="text-xs text-muted-foreground hover:text-foreground" title={nav.truncated ? "Only the first 9 stops fit a Google Maps link" : "Open turn-by-turn in Google Maps"} aria-label={\`Navigate day ${day.dayIndex + 1} in Google Maps\`}>▸ Navigate</a>`.
  - **Whole-trip downloads:** after the `＋ Add day` button (still inside the `space-y-3` div), add a row:
    ```tsx
    <div className="flex gap-2 pt-1">
      <Button variant="outline" size="sm" className="flex-1"
        onClick={() => downloadText(`${slugify(trip.title)}.kml`, "application/vnd.google-earth.kml+xml", buildKml(exportModel))}>
        ⬇ KML (My Maps)
      </Button>
      <Button variant="outline" size="sm" className="flex-1"
        onClick={() => downloadText(`${slugify(trip.title)}.gpx`, "application/gpx+xml", buildGpx(exportModel))}>
        ⬇ GPX
      </Button>
    </div>
    ```
- [ ] `bun run build` + `bun run test` pass. Commit (stage only the changed files).

---

### Task 7: Verification + merge

- [ ] Live smoke test on a real trip: each day header shows `▸ Navigate` (opens a Google Maps directions URL with the right origin/stops/destination); KML downloads and imports into Google My Maps (days as layers, colored routes, pins, nights); GPX downloads and is valid. No console errors. `bun run build` + `bun run test` green.
- [ ] Dispatch a final review over `git diff main...HEAD` against the spec. Apply high-confidence fixes, then use `superpowers:finishing-a-development-branch` to merge to `main` (`--no-ff`, delete branch).
