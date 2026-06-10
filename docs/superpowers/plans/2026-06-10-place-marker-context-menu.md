# Place Marker Context Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Right-clicking a place pin on the map opens a context menu (named by the place) with Edit (opens the existing `PlaceEditor`) and Remove (immediate delete).

**Architecture:** A new `poiMenu` state in `trip-map.tsx`, opened by each POI marker's `onContextMenu` (which `preventDefault`s + `stopPropagation`s so the background map menu stays closed), renders a menu wired to two new `onEditPoi`/`onRemovePoi` callbacks. `planner-shell.tsx` provides them: Remove via `useRemovePoi`, Edit via an `editingPoiId` state that renders the existing `PlaceEditor` modal.

**Tech Stack:** Next.js 16, React 19, TypeScript, `@vis.gl/react-google-maps`, TanStack Query, Bun. UI-only (no backend, no unit tests) — verified via `bun run build` + live smoke.

---

## Reference

- POI markers are `AdvancedMarker` + `Pin` in `components/trip-map.tsx` (around lines 179-187); each `MapPoint` has `id`.
- Existing background menu uses a `menu` state + a backdrop (`fixed inset-0 z-20`) + a fixed popup (`fixed z-30 …`), and a `useEffect` that closes it on Escape.
- `PlaceEditor` (`components/place-editor.tsx`) — fixed-overlay modal, props `{ poi: PoiDetail, tripId: string, onClose: () => void }`.
- `useRemovePoi(tripId)` (`hooks/use-poi-mutations.ts`) → `removePoi.mutate(poiId)` → `DELETE /api/pois/[poiId]`, invalidates trip + route queries.
- The optional shared-`ContextMenu`-wrapper refactor from the spec is **intentionally skipped** here to keep the working background menu untouched; the POI menu reuses the same markup pattern inline.

---

## Task 1: POI marker context menu in `trip-map.tsx`

**Files:**
- Modify: `components/trip-map.tsx`

- [ ] **Step 1: Add `onEditPoi` / `onRemovePoi` props**

In the `TripMap` destructured params (after `dayColors = {},`), add:
```tsx
  onEditPoi,
  onRemovePoi,
```
In the props type object (after `dayColors?: Record<string, string>;`), add:
```tsx
  onEditPoi?: (poiId: string) => void;
  onRemovePoi?: (poiId: string) => void;
```

- [ ] **Step 2: Add the `poiMenu` state**

Immediately after the existing `menu` state line
(`const [menu, setMenu] = useState<{ x: number; y: number; lat: number; lng: number; placeId: string | null } | null>(null);`)
add:
```tsx
  const [poiMenu, setPoiMenu] = useState<{ x: number; y: number; poiId: string; name: string } | null>(null);
```

- [ ] **Step 3: Close `poiMenu` on Escape**

After the existing menu-Escape `useEffect` (the one with `if (!menu) return;` … `}, [menu]);`), add a parallel effect:
```tsx
  useEffect(() => {
    if (!poiMenu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPoiMenu(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [poiMenu]);
```

- [ ] **Step 4: Wrap each POI marker's `Pin` with an `onContextMenu`**

Replace the POI markers block:
```tsx
      {pois.map((p, i) => (
        <AdvancedMarker key={p.id ?? i} position={p} title={p.name}>
          <Pin
            background={p.color?.background ?? "#64748b"}
            borderColor={p.color?.border ?? "#475569"}
            glyphColor="#ffffff"
          />
        </AdvancedMarker>
      ))}
```
with:
```tsx
      {pois.map((p, i) => (
        <AdvancedMarker key={p.id ?? i} position={p} title={p.name}>
          <div
            onContextMenu={(e) => {
              if (!p.id) return;
              e.preventDefault();   // suppress the native browser menu
              e.stopPropagation();  // don't also open the map's background menu
              setMenu(null);
              setPoiMenu({ x: e.clientX, y: e.clientY, poiId: p.id, name: p.name });
            }}
          >
            <Pin
              background={p.color?.background ?? "#64748b"}
              borderColor={p.color?.border ?? "#475569"}
              glyphColor="#ffffff"
            />
          </div>
        </AdvancedMarker>
      ))}
```

- [ ] **Step 5: Render the POI menu**

Find the end of the existing background-menu block — it closes with `</div>` then `)}` for the `{menu && (…) && ( … )}` expression, followed by the component's final `</div>` and `);`. Immediately **after** the background menu's closing `)}` and **before** the final `</div>`, add:
```tsx
    {poiMenu && (onEditPoi || onRemovePoi) && (
      <>
        <div
          className="fixed inset-0 z-20"
          onClick={() => setPoiMenu(null)}
          onContextMenu={(e) => {
            e.preventDefault();
            setPoiMenu(null);
          }}
        />
        <div
          role="menu"
          className="fixed z-30 min-w-44 rounded-md border bg-background py-1 text-sm shadow-md"
          style={{ left: poiMenu.x, top: poiMenu.y }}
        >
          <div className="truncate border-b px-3 pb-1 pt-1 text-xs font-medium text-muted-foreground">
            {poiMenu.name}
          </div>
          {onEditPoi && (
            <button
              type="button"
              role="menuitem"
              className="block w-full px-3 py-1.5 text-left hover:bg-accent"
              onClick={() => {
                onEditPoi(poiMenu.poiId);
                setPoiMenu(null);
              }}
            >
              ✎ Edit
            </button>
          )}
          {onRemovePoi && (
            <button
              type="button"
              role="menuitem"
              className="block w-full px-3 py-1.5 text-left text-red-600 hover:bg-accent"
              onClick={() => {
                onRemovePoi(poiMenu.poiId);
                setPoiMenu(null);
              }}
            >
              ✕ Remove
            </button>
          )}
        </div>
      </>
    )}
```

- [ ] **Step 6: Build**

Run: `bun run build 2>&1 | tail -5`
Expected: "✓ Compiled successfully", no type errors. (The new props are optional, so unrelated callers still compile.)

- [ ] **Step 7: Commit**

```bash
git add components/trip-map.tsx
git commit -m "feat(map): right-click a place pin for an Edit/Remove context menu"
```

---

## Task 2: Wire Edit/Remove in `planner-shell.tsx`

**Files:**
- Modify: `components/planner-shell.tsx`

- [ ] **Step 1: Imports**

Change the poi-mutations import line:
```ts
import { useAddPoi, useMovePoi, useOptimizeDay, useBuildSplit, useResplit } from "@/hooks/use-poi-mutations";
```
to add `useRemovePoi`:
```ts
import { useAddPoi, useMovePoi, useRemovePoi, useOptimizeDay, useBuildSplit, useResplit } from "@/hooks/use-poi-mutations";
```
Add the `PlaceEditor` import (near the other component imports):
```ts
import { PlaceEditor } from "@/components/place-editor";
```

- [ ] **Step 2: Hook + state**

With the other hooks (after `const movePoi = useMovePoi(tripId);`), add:
```ts
  const removePoi = useRemovePoi(tripId);
```
With the other `useState` declarations (before the `if (isLoading)` / `if (isError || !trip)` guards), add:
```ts
  const [editingPoiId, setEditingPoiId] = useState<string | null>(null);
```

- [ ] **Step 3: Pass the callbacks to `TripMap`**

In the `<TripMap … />` usage, add (e.g. right after `addedPlaceIds={addedPlaceIds}`):
```tsx
              onEditPoi={(id) => setEditingPoiId(id)}
              onRemovePoi={(id) => removePoi.mutate(id)}
```

- [ ] **Step 4: Render `PlaceEditor` when a poi is being edited**

The loaded return ends with the `ConfirmDialog` block followed by `</MapPickProvider>` then `</APIProvider>`. The tail looks like:
```tsx
      {confirmingRemove && (
        <ConfirmDialog
          …
        />
      )}
      </MapPickProvider>
    </APIProvider>
```
Insert, **after** the `ConfirmDialog` block and **before** `</MapPickProvider>`:
```tsx
      {(() => {
        const editingPoi = editingPoiId ? trip.pois.find((p) => p.id === editingPoiId) : null;
        return editingPoi ? (
          <PlaceEditor poi={editingPoi} tripId={tripId} onClose={() => setEditingPoiId(null)} />
        ) : null;
      })()}
```

- [ ] **Step 5: Build**

Run: `bun run build 2>&1 | tail -5`
Expected: "✓ Compiled successfully", no type errors.

- [ ] **Step 6: Commit**

```bash
git add components/planner-shell.tsx
git commit -m "feat(map): wire place-pin Edit (PlaceEditor) and Remove (useRemovePoi)"
```

---

## Task 3: Verification

**Files:** none.

- [ ] **Step 1: Build + tests**

Run: `bun run build 2>&1 | tail -5` → "✓ Compiled successfully".
Run: `bun run test 2>&1 | tail -5` → all pass (156; no test changes, just a regression check).

- [ ] **Step 2: Live smoke (the Nordkapp trip)**

Restart the dev server if needed, open the Nordkapp trip, and verify:
1. **Right-click a place pin** → a menu appears headed with the place name, with **✎ Edit** and **✕ Remove**.
2. **Edit** → the `PlaceEditor` modal opens for that place; change a field (e.g. description) and Save → it persists.
3. **Remove** → the stop is deleted (its pin disappears; the affected day's drive time / route updates).
4. **Right-click empty map** still shows the original **Add to Places / Add waypoint / Set night** menu, and the POI menu does **not** appear there.
5. Left-click on a pin does nothing new (no regression); right-click closes via outside-click and Escape.
6. No console errors.

- [ ] **Step 3: Final review + finish**

Dispatch a final review over `git diff main...HEAD` against the spec. Apply high-confidence fixes, then use `superpowers:finishing-a-development-branch` to merge to `main` (`--no-ff`, delete branch).

---

## Notes for the implementer

- **The marker `onContextMenu` is a DOM event on the marker's content `<div>`**, which `AdvancedMarker` renders into the map overlay. `preventDefault` stops the native browser menu; `stopPropagation` + the `setMenu(null)` call keep the background map menu from co-appearing. If the live smoke shows the background menu ALSO opening on a pin right-click, that's the thing to fix (the POI menu is on top regardless, but only one should show).
- **`PlaceEditor` is the exact modal the sidebar list uses** — no editor changes; we only open it from a new place. One instance is open at a time in practice.
- **Remove is immediate** (no confirm), matching the sidebar `CatalogRow` ✕. The mutation invalidates trip + route, so the pin and route self-update.
