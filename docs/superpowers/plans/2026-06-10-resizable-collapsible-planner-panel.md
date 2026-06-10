# Resizable, Collapsible Planner Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the planner side panel to the left, make it resizable by a drag handle, and make its Settings / Places / Days sections collapsible — width and collapse states persisted in `localStorage`.

**Architecture:** A `useResizableWidth` hook (with a pure `clampWidth` helper) drives the panel width via an inline style and a drag handle; a `CollapsibleSection` component wraps each of the three sections. `planner-shell.tsx` reorders its flex row (panel → handle → map) and wraps content into the sections. Persistence is per-browser `localStorage`, loaded after mount to stay hydration-safe.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind, Bun. `clampWidth` is unit-tested; the rest is `bun run build` + live smoke.

---

## Reference

- `components/planner-shell.tsx` renders (loaded state) `<div className="flex h-screen w-full">` containing the map `<div className="relative flex-1">` then `<aside className="flex w-80 shrink-0 flex-col overflow-y-auto border-l p-4">`.
- Inside the aside, the start/finish summary + Start/Finish fields are currently inside an IIFE that locally computes `finishMode`/`activeFinish`. This plan lifts those to component-body consts.
- Pure-function tests live under `tests/`.

---

## File Structure

| File | Responsibility | Action |
|------|----------------|--------|
| `lib/ui/clamp.ts` | `clampWidth(value, min, max)` | Create |
| `tests/ui/clamp.test.ts` | clamp unit tests | Create |
| `hooks/use-resizable-width.ts` | width state + drag + persistence | Create |
| `components/collapsible-section.tsx` | reusable collapsible section | Create |
| `components/planner-shell.tsx` | panel left + handle + sections | Modify |

---

## Task 1: `clampWidth` + `useResizableWidth`

**Files:**
- Create: `lib/ui/clamp.ts`
- Test: `tests/ui/clamp.test.ts`
- Create: `hooks/use-resizable-width.ts`

- [ ] **Step 1: Write the failing clamp test**

Create `tests/ui/clamp.test.ts`:

```ts
import { test, expect, describe } from "bun:test";
import { clampWidth } from "@/lib/ui/clamp";

describe("clampWidth", () => {
  test("clamps below min, above max, and passes through in-range", () => {
    expect(clampWidth(100, 280, 720)).toBe(280);
    expect(clampWidth(900, 280, 720)).toBe(720);
    expect(clampWidth(400, 280, 720)).toBe(400);
    expect(clampWidth(280, 280, 720)).toBe(280);
    expect(clampWidth(720, 280, 720)).toBe(720);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `bun run test 2>&1 | tail -8`
Expected: FAIL — `clampWidth` not found.

- [ ] **Step 3: Implement the helper**

Create `lib/ui/clamp.ts`:

```ts
export function clampWidth(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `bun run test 2>&1 | tail -8`
Expected: PASS.

- [ ] **Step 5: Create the hook**

Create `hooks/use-resizable-width.ts`:

```ts
import { useCallback, useEffect, useRef, useState } from "react";
import { clampWidth } from "@/lib/ui/clamp";

/** A panel width (px) that the user resizes by dragging a handle on the panel's
 *  RIGHT edge (drag right ⇒ wider). Loaded from / saved to localStorage[key]. */
export function useResizableWidth(
  key: string,
  opts: { initial: number; min: number; max: number },
): { width: number; onHandleMouseDown: (e: React.MouseEvent) => void } {
  const { initial, min, max } = opts;
  const [width, setWidth] = useState(initial);
  const widthRef = useRef(initial);
  widthRef.current = width;

  // Load the saved width after mount (not in the initializer — avoids an SSR/
  // hydration mismatch between the server's default and the client's stored value).
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(key);
      if (stored != null) {
        const n = Number(stored);
        if (Number.isFinite(n)) setWidth(clampWidth(n, min, max));
      }
    } catch {
      // ignore unavailable localStorage
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const onHandleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = widthRef.current;
      const prevUserSelect = document.body.style.userSelect;
      document.body.style.userSelect = "none";

      const onMove = (ev: MouseEvent) => {
        setWidth(clampWidth(startWidth + (ev.clientX - startX), min, max));
      };
      const onUp = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        document.body.style.userSelect = prevUserSelect;
        try {
          window.localStorage.setItem(key, String(widthRef.current));
        } catch {
          // ignore
        }
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [key, min, max],
  );

  return { width, onHandleMouseDown };
}
```

- [ ] **Step 6: Build**

Run: `bun run build 2>&1 | tail -5` → "✓ Compiled successfully".

- [ ] **Step 7: Commit**

```bash
git add lib/ui/clamp.ts tests/ui/clamp.test.ts hooks/use-resizable-width.ts
git commit -m "feat(ui): clampWidth + useResizableWidth hook"
```

---

## Task 2: `CollapsibleSection`

**Files:**
- Create: `components/collapsible-section.tsx`

- [ ] **Step 1: Create the component**

Create `components/collapsible-section.tsx`:

```tsx
"use client";

import { useEffect, useState, type ReactNode } from "react";

/** A sidebar section with a clickable header (chevron + title + optional count)
 *  that collapses its children. Open state persists to localStorage[storageKey];
 *  defaults open (loaded after mount to stay hydration-safe). */
export function CollapsibleSection({
  title,
  count,
  storageKey,
  defaultOpen = true,
  children,
}: {
  title: string;
  count?: number;
  storageKey: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored === "open") setOpen(true);
      else if (stored === "closed") setOpen(false);
    } catch {
      // ignore
    }
  }, [storageKey]);

  function toggle() {
    setOpen((o) => {
      const next = !o;
      try {
        window.localStorage.setItem(storageKey, next ? "open" : "closed");
      } catch {
        // ignore
      }
      return next;
    });
  }

  return (
    <div className="mb-4">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="mb-2 flex w-full items-center gap-1 text-sm font-medium"
      >
        <span className="w-3 text-xs text-muted-foreground">{open ? "▾" : "▸"}</span>
        <span>{title}</span>
        {count != null && <span className="font-normal text-muted-foreground">({count})</span>}
      </button>
      {open && <div>{children}</div>}
    </div>
  );
}
```

- [ ] **Step 2: Build**

Run: `bun run build 2>&1 | tail -5` → "✓ Compiled successfully" (component not yet used, but must type-check).

- [ ] **Step 3: Commit**

```bash
git add components/collapsible-section.tsx
git commit -m "feat(ui): reusable CollapsibleSection"
```

---

## Task 3: Restructure `planner-shell.tsx` (panel left, handle, sections)

**Files:**
- Modify: `components/planner-shell.tsx`

- [ ] **Step 1: Imports**

Add to the imports:
```ts
import { useResizableWidth } from "@/hooks/use-resizable-width";
import { CollapsibleSection } from "@/components/collapsible-section";
```

- [ ] **Step 2: Hook + lifted consts in the component body**

After the `if (isError || !trip) { … }` guard and the existing `const apiKey = …` / `const start = …` / `const end = …` lines, add:
```ts
  const { width: sidebarWidth, onHandleMouseDown } = useResizableWidth("rtp.sidebarWidth", {
    initial: 320,
    min: 280,
    max: 720,
  });
  const finishMode: "open" | "round" | "place" =
    trip.endLat != null ? "place" : trip.isRoundTrip ? "round" : "open";
  const activeFinish = pendingMode ?? finishMode;
```

- [ ] **Step 3: Replace the whole flex-row block**

Find the entire row block — from `<div className="flex h-screen w-full">` through its matching `</div>` (the one right before `{confirmingRemove && (` near the end of the loaded return) — and replace it with the following. Inner content (the `<TripMap … />` props, the archive/remove buttons, the day cards, etc.) is reproduced verbatim from the current file; only the **structure** changes (panel first, handle, map; IIFE removed; Total-driving hoisted; three `CollapsibleSection`s; the old inline "Places (N)" label removed since the section header now shows it).

```tsx
      <div className="flex h-screen w-full">
        <aside
          style={{ width: sidebarWidth }}
          className="flex shrink-0 flex-col overflow-y-auto border-r p-4"
        >
          <Link
            href="/"
            className="mb-2 inline-block text-xs text-muted-foreground hover:text-foreground"
          >
            ← Trips
          </Link>
          <div className="mb-2 flex items-center gap-2">
            {trip.archivedAt && (
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Archived
              </span>
            )}
            {trip.archivedAt ? (
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
                disabled={archiveTrip.isPending}
                onClick={() => archiveTrip.mutate(false)}
              >
                Restore
              </button>
            ) : (
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
                disabled={archiveTrip.isPending}
                onClick={() => archiveTrip.mutate(true)}
              >
                Archive
              </button>
            )}
            <button
              type="button"
              className="text-xs text-red-600 hover:text-red-700 disabled:opacity-50"
              disabled={removing}
              onClick={() => setConfirmingRemove(true)}
            >
              Remove
            </button>
          </div>
          <input
            key={trip.title}
            defaultValue={trip.title}
            aria-label="Trip name"
            className="mb-1 w-full rounded bg-transparent text-lg font-semibold outline-none hover:bg-muted/40 focus:bg-muted/40"
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v && v !== trip.title) setTitle.mutate(v);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
          />
          <p className="mb-2 text-sm text-muted-foreground">
            {trip.startName}
            {activeFinish === "place"
              ? ` → ${trip.endName ?? "destination…"}`
              : activeFinish === "round"
                ? " ↺ round trip"
                : " → (open)"}
          </p>
          {route && route.totalSeconds > 0 && (
            <p className="mb-4 text-xs text-muted-foreground">
              Total driving: {formatDuration(route.totalSeconds)} · {formatKm(route.totalMeters)}
            </p>
          )}

          <CollapsibleSection title="Settings" storageKey="rtp.section.settings">
            <div className="mb-3 space-y-2">
              <div>
                <div className="mb-1 text-xs text-muted-foreground">
                  Start: <span className="text-foreground">{trip.startName}</span>
                </div>
                <PlaceAutocomplete
                  placeholder="Change start…"
                  pickId="start"
                  onPick={(p) =>
                    updateBase.mutate({
                      start: { name: p.name, lat: p.lat, lng: p.lng, placeId: p.placeId },
                    })
                  }
                />
              </div>

              <div>
                <div className="mb-1 text-xs text-muted-foreground">Finish</div>
                <div role="group" aria-label="Finish mode" className="flex gap-1">
                  <Button
                    size="sm"
                    variant={activeFinish === "open" ? "default" : "outline"}
                    aria-pressed={activeFinish === "open"}
                    className="h-7 px-2 text-xs"
                    onClick={() => {
                      setPendingMode("open");
                      updateBase.mutate({ finish: { mode: "open" } });
                    }}
                  >
                    Open
                  </Button>
                  <Button
                    size="sm"
                    variant={activeFinish === "round" ? "default" : "outline"}
                    aria-pressed={activeFinish === "round"}
                    className="h-7 px-2 text-xs"
                    onClick={() => {
                      setPendingMode("round");
                      updateBase.mutate({ finish: { mode: "round" } });
                    }}
                  >
                    Round trip
                  </Button>
                  <Button
                    size="sm"
                    variant={activeFinish === "place" ? "default" : "outline"}
                    aria-pressed={activeFinish === "place"}
                    className="h-7 px-2 text-xs"
                    onClick={() => setPendingMode("place")}
                  >
                    Place
                  </Button>
                </div>
                {activeFinish === "place" && !updateBase.isPending && (
                  <div className="mt-1">
                    {trip.endName ? (
                      <div className="mb-1 text-xs text-muted-foreground">
                        Ends at: <span className="text-foreground">{trip.endName}</span>
                      </div>
                    ) : null}
                    <PlaceAutocomplete
                      placeholder="Search destination…"
                      pickId="finish"
                      onPick={(p) =>
                        updateBase.mutate({
                          finish: {
                            mode: "place",
                            place: { name: p.name, lat: p.lat, lng: p.lng, placeId: p.placeId },
                          },
                        })
                      }
                    />
                  </div>
                )}
              </div>
            </div>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Start date</span>
              <input
                type="date"
                value={trip.startDate ? trip.startDate.slice(0, 10) : ""}
                onChange={(e) => setStartDate.mutate(e.target.value || null)}
                className="rounded border bg-background px-1 py-0.5 text-xs"
              />
            </label>
          </CollapsibleSection>

          <CollapsibleSection title="Places" count={trip.pois.length} storageKey="rtp.section.places">
            <div className="mb-4">
              <PlaceAutocomplete
                placeholder="Search a place to add…"
                ariaLabel="Search a place to add"
                pickId="add"
                onPick={(p) => {
                  if (p.placeId)
                    setPreview({
                      placeId: p.placeId,
                      position: { lat: p.lat, lng: p.lng },
                      source: "search",
                    });
                }}
              />
            </div>
            <div className="mb-3 flex gap-2">
              <Button
                size="sm"
                className="flex-1"
                disabled={unscheduledCount === 0 || buildSplit.isPending}
                onClick={() => buildSplit.mutate()}
              >
                {buildSplit.isPending ? "Splitting…" : "Build route & split into days"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={assignedCount === 0 || resplit.isPending}
                onClick={() => {
                  if (
                    window.confirm(
                      "Re-split the whole trip? This rebuilds every day from scratch.",
                    )
                  ) {
                    resplit.mutate();
                  }
                }}
              >
                {resplit.isPending ? "Re-splitting…" : "Re-split all"}
              </Button>
            </div>
            <MasterList trip={trip} tripId={tripId} />
          </CollapsibleSection>

          <CollapsibleSection title="Days" count={trip.days.length} storageKey="rtp.section.days">
            <DragDropProvider onDragEnd={onItineraryDragEnd}>
              <div className="space-y-3">
                {trip.days.map((day) => (
                  <div key={day.id} className="rounded-md border p-3">
                    <div className="mb-2 flex items-center justify-between gap-2 text-sm font-medium">
                      <span className="flex items-center gap-2">
                        <GroupColorPicker
                          color={day.color ?? defaultDayColor(day.dayIndex)}
                          label={`Day ${day.dayIndex + 1}`}
                          onChange={(hex) => setDayColor.mutate({ dayId: day.id, color: hex })}
                        />
                        <span>
                          Day {day.dayIndex + 1}
                          {formatDayDate(trip.startDate, day.dayIndex) ? (
                            <span className="ml-1 font-normal text-muted-foreground">
                              · {formatDayDate(trip.startDate, day.dayIndex)}
                            </span>
                          ) : null}
                        </span>
                      </span>
                      <span className="flex items-center gap-2">
                        {route?.perDaySeconds[day.id] ? (
                          <span className="text-xs font-normal text-muted-foreground">
                            🚗 {formatDuration(route.perDaySeconds[day.id])}
                            {route.perDayMeters?.[day.id]
                              ? ` · ${formatKm(route.perDayMeters[day.id])}`
                              : ""}
                          </span>
                        ) : null}
                        {byDay(day.id).length >= 3 ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs font-normal"
                            disabled={optimizeDay.isPending && optimizeDay.variables === day.id}
                            onClick={() => optimizeDay.mutate(day.id)}
                            aria-label={`Optimize order of day ${day.dayIndex + 1}`}
                          >
                            {optimizeDay.isPending && optimizeDay.variables === day.id ? "Optimizing…" : "Optimize"}
                          </Button>
                        ) : null}
                        <button
                          type="button"
                          aria-label={`Remove day ${day.dayIndex + 1}`}
                          className="px-1 text-xs text-muted-foreground hover:text-red-600"
                          onClick={() => {
                            if (window.confirm("Remove this day? Its places go back to the list and its night is discarded.")) {
                              removeDay.mutate(day.id);
                            }
                          }}
                        >
                          ✕
                        </button>
                      </span>
                    </div>
                    <PoiContainer id={day.id} pois={byDay(day.id)} tripId={tripId} emptyText="Assign places from the list above." />
                    <DayNight
                      tripId={tripId}
                      dayId={day.id}
                      night={day.night}
                    />
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  disabled={addDay.isPending}
                  onClick={() => addDay.mutate()}
                >
                  ＋ Add day
                </Button>
              </div>
            </DragDropProvider>
          </CollapsibleSection>
        </aside>

        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize panel"
          onMouseDown={onHandleMouseDown}
          className="w-1.5 shrink-0 cursor-col-resize bg-border hover:bg-accent"
        />

        <div className="relative flex-1">
          {apiKey ? (
            <TripMap
              start={start}
              end={end}
              pois={poiPoints}
              onAddPlace={handleAddFromMap}
              legs={route?.legs ?? []}
              dayColors={dayColors}
              vias={trip.routeVias}
              onAddVia={(afterPoiId, lat, lng) => addVia.mutate({ afterPoiId, lat, lng })}
              onMoveVia={(viaId, lat, lng) => moveVia.mutate({ viaId, lat, lng })}
              onRemoveVia={(viaId) => removeVia.mutate(viaId)}
              nights={trip.days.filter((d) => d.night).map((d) => ({ dayId: d.id, lat: d.night!.lat, lng: d.night!.lng }))}
              onMoveNight={(dayId, lat, lng) => updateNight.mutate({ dayId, lat, lng })}
              dayChoices={trip.days.map((d) => ({
                id: d.id,
                label: formatDayDate(trip.startDate, d.dayIndex)
                  ? `Day ${d.dayIndex + 1} · ${formatDayDate(trip.startDate, d.dayIndex)}`
                  : `Day ${d.dayIndex + 1}`,
              }))}
              onSetNight={(dayId, lat, lng) => {
                const day = trip.days.find((d) => d.id === dayId);
                if (day?.night) updateNight.mutate({ dayId, lat, lng });
                else setNight.mutate({ dayId, lat, lng });
              }}
              preview={preview}
              onPreviewPlace={(placeId, position, source) =>
                setPreview({ placeId, position, source })
              }
              onPreviewClose={() => setPreview(null)}
              addedPlaceIds={addedPlaceIds}
              onEditPoi={(id) => setEditingPoiId(id)}
              onRemovePoi={(id) => removePoi.mutate(id)}
            />
          ) : (
            <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
              Set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to enable the map and place search.
            </div>
          )}
        </div>
      </div>
```

- [ ] **Step 4: Build + tests**

Run: `bun run build 2>&1 | tail -5` → "✓ Compiled successfully", no type errors (watch for an unused-variable error if the old IIFE's local `finishMode`/`activeFinish` weren't fully removed — they are now component-body consts).
Run: `bun run test 2>&1 | tail -5` → all pass.

- [ ] **Step 5: Commit**

```bash
git add components/planner-shell.tsx
git commit -m "feat(planner): left panel, resizable handle, collapsible sections"
```

---

## Task 4: Verification

**Files:** none.

- [ ] **Step 1: Tests + build**

Run: `bun run test 2>&1 | tail -6` → all pass.
Run: `bun run build 2>&1 | tail -5` → "✓ Compiled successfully".

- [ ] **Step 2: Live smoke (the Nordkapp trip)**

Restart the dev server if needed, open the Nordkapp trip:
1. The panel is on the **left**, the map fills the right.
2. Drag the handle (between panel and map): the panel widens dragging right, narrows dragging left, clamped (~280–720px). Reload → the width is remembered.
3. **Settings**, **Places (N)**, **Days (N)** each collapse/expand on header click; reload → states remembered. A fresh browser (or cleared `rtp.*` keys) shows all three expanded.
4. Everything inside still works (edit start/finish, add a place, build/split, edit a day, the map). No console errors.

- [ ] **Step 3: Final review + finish**

Dispatch a final review over `git diff main...HEAD` against the spec. Apply high-confidence fixes, then use `superpowers:finishing-a-development-branch` to merge to `main` (`--no-ff`, delete branch).

---

## Notes for the implementer

- The width state starts at 320 and is overwritten by the stored value in a mount effect — do **not** read `localStorage` in `useState(...)` (it would cause a hydration mismatch).
- The drag handle sits between the panel and the map; because the panel is on the LEFT, dragging right increases width (`startWidth + (clientX - startX)`).
- The old inline `<div className="mb-2 text-sm font-medium">Places ({trip.pois.length})</div>` label is intentionally dropped — the `CollapsibleSection` header now shows "Places (N)".
- "Total driving" is hoisted above the sections (always visible); "Start date" moves into the Settings section.
