# Trip export / import (backup & restore)

**Goal:** Per-trip JSON **export** (backup) and **import** (restore) so trips can be copied between servers (e.g. local → production). On import a brand-new trip is created **owned by the current user**, with fresh ids (no collisions on the target server). Buttons: an "Export" item in each trip's ⋮ menu (downloads a file); an "Import" button by "New trip" (file picker).

**Decisions:**
- Export scope = **one trip per file** (the full graph: trip + days + nights + pois + groups + vias). Shares are NOT exported. User/owner ids are NOT exported.
- Import = create a NEW trip for `session.userId`, **remapping all ids** (days/groups/pois and their cross-refs). Imported trip comes in **active** (`archivedAt = null`).
- References that don't resolve after remap (orphan `dayId`/`groupId`/`afterPoiId`) → set to `null` defensively, never fail.

> Workers: Bun + Next 16. Don't run prettier. Stage only your files. `@/*` = repo root. Prisma relations: `trip.days` (each `day.night` = NightStop, `day.pois`), `trip.pois`, `trip.poiGroups`, `trip.routeVias`. Field lists are in `prisma/schema.prisma`.

---

### Task 1 — Core transfer module (`lib/trips/transfer.ts`) + tests

Create `lib/trips/transfer.ts`:

- Constants: `export const TRIP_EXPORT_FORMAT = "roadtripplanner.trip"; export const TRIP_EXPORT_VERSION = 1;`
- `export type TripExport = { format; version; exportedAt; trip; groups[]; days[]; pois[]; nights[]; vias[] }` — see fields below.
- `export async function loadTripGraph(prisma, tripId)` — `prisma.trip.findUnique({ where: { id }, include: { days: { include: { night: true } }, pois: true, poiGroups: true, routeVias: true } })`. (Returns the raw graph or null.)
- `export function serializeTrip(graph): TripExport` — map raw rows → the export shape. **Keep original ids** on `days`, `groups`, `pois` so cross-refs resolve; dates → ISO strings; include every content field:
  - `trip`: title, startName, startLat, startLng, startPlaceId, endName, endLat, endLng, endPlaceId, description, startDate(ISO|null), params(string|null).
  - `groups[]`: id, name, color, orderIndex.
  - `days[]`: id, dayIndex, color, date(ISO|null), notes.
  - `pois[]`: id, dayId, orderInDay, name, lat, lng, placeId, category, groupId, orderInGroup, rating, imageUrl, address, description, openingHours, aiReason, userNote.
  - `nights[]`: dayId, lat, lng, title, url, notes.
  - `vias[]`: afterPoiId, lat, lng, seq.
- `export const tripImportSchema` (zod) — validate `format === TRIP_EXPORT_FORMAT`, `version === 1`, the `trip` object (strings/numbers, lat/lng finite, startDate ISO|null), and arrays of the above shapes (coerce/allow nulls). Be tolerant of missing optional fields (default to null/empty). Reject unknown format/version with a clear message.
- `export async function importTrip(prisma, data: unknown, userId: string): Promise<{ id: string }>`:
  - `const parsed = tripImportSchema.parse(data)` (throws `ZodError` on bad input — caller maps to 400).
  - In a `prisma.$transaction(async (tx) => { ... })`:
    1. Create `Trip` with `userId`, all trip fields, `startDate` → Date|null, `archivedAt: null`. Capture new `tripId`.
    2. Create `Day`s; build `dayIdMap: Map<oldId,newId>`.
    3. Create `PoiGroup`s; build `groupIdMap`.
    4. Create `Poi`s — `dayId: dayIdMap.get(old) ?? null`, `groupId: groupIdMap.get(old) ?? null`; build `poiIdMap`.
    5. Create `NightStop`s — `dayId: dayIdMap.get(old)` (skip if unmapped).
    6. Create `RouteVia`s — `afterPoiId: old ? (poiIdMap.get(old) ?? null) : null`.
    - Return `{ id: tripId }`.

Tests `tests/trips/transfer.test.ts` (mirror `tests/itinerary/days.test.ts`'s PrismaClient + beforeEach cleanup):
- Build a trip via `createTrip` + `addDay`/`addPoi`/`setNight`/`createGroup`/`moveToGroup`/`addVia` (reuse operations) so there's a real multi-day graph with a group, a night, and a via.
- `serializeTrip(await loadTripGraph(...))` → assert counts + a couple of field values + `format`/`version`.
- `importTrip(prisma, serialized, otherUserId)` → load the new graph; assert: **new trip id ≠ original**, `userId === otherUserId`, same day/poi/group/night/via counts, a poi still points at the right (remapped) day & group, the via's `afterPoiId` maps to a poi in the new trip, and **no id overlaps** with the original (ids were regenerated).

Verify: `bun run test:db >/dev/null; DATABASE_URL="file:./test.db" bun run test tests/trips/transfer.test.ts` green; `bun run build`. Commit `lib/trips/transfer.ts tests/trips/transfer.test.ts`.

---

### Task 2 — API routes

- `app/api/trips/[tripId]/export/route.ts` — `GET`: `getSession()` → 401 if none; `requireRead(prisma, session, tripId)` (catch `HttpError` → its status); `const graph = await loadTripGraph(prisma, tripId)` → 404 if null; `const data = serializeTrip(graph)`. Return `new NextResponse(JSON.stringify(data, null, 2), { headers: { "Content-Type": "application/json", "Content-Disposition": \`attachment; filename="trip-${slugify(graph.title)}.json"\` } })`. (Reuse `slugify` from `@/lib/export/download` if exported there; else inline a tiny slug.)
- `app/api/trips/import/route.ts` — `POST`: `getSession()` → 401; `const body = await req.json().catch(() => null)`; `try { const { id } = await importTrip(prisma, body, session.userId); return NextResponse.json({ id }, { status: 201 }); } catch (e) { if (e instanceof ZodError) return NextResponse.json({ error: "Invalid trip file" }, { status: 400 }); throw e; }`.

Verify `bun run build`. Commit the two route files.

---

### Task 3 — UI + client helper

- `lib/api/trips.ts`: add `export function exportTripUrl(id: string) { return \`/api/trips/${id}/export\`; }` and
  `export async function importTripRequest(data: unknown): Promise<{ id: string }> { const res = await fetch("/api/trips/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }); if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? \`Import failed (${res.status})\`); return res.json(); }` (match the file's existing error style).
- `components/trips-list.tsx`: add an **"Export"** `MenuItem` (for all roles) to `TripRow`'s menu — on click, trigger a download: create an `<a>` with `href = exportTripUrl(trip.id)`, `download` attr, click it (the GET is cookie-authed). Place it above Archive.
- `components/import-trip-button.tsx` (new, client): a `<Button variant="outline">Import</Button>` + a hidden `<input type="file" accept="application/json,.json">`. On file select: `JSON.parse(await file.text())` (catch → alert "Not a valid JSON file"), `await importTripRequest(json)`, then `router.push(\`/trips/${id}\`)`. Show a busy state; alert on error.
- `app/page.tsx`: render `<ImportTripButton />` in the header next to the "New trip" button.

Verify `bun run build`; `bun run test` (full suite) green. Commit the UI + helper files.

---

### Task 4 — Review + merge

Review `git diff main...HEAD`: import always sets `userId = session.userId` (no owner spoofing); export is `requireRead`-gated; id remapping has no leftover original ids; orphan refs → null (no FK errors); transaction atomicity. Then `superpowers:finishing-a-development-branch` → merge `--no-ff`, delete branch.
