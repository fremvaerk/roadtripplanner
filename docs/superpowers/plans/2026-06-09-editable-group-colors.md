# Editable Group Colors → Colored Markers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each place group an editable color (preset swatches + custom picker), auto-assigned on creation, and tint each place's map pin with its group's color.

**Architecture:** Add a `color` column to `PoiGroup`; `createGroup` sets it from a palette by order; a group PATCH accepts `color`; pure color helpers live in `lib/places/group-colors.ts`. The planner attaches each POI's group color to its `MapPoint`; `trip-map` renders the `<Pin>` with it. The master-list group header gets a color-dot picker.

**Tech Stack:** Next.js 16 / React 19, TypeScript, Prisma 7 (libSQL) + `prisma db push`, Zod 4, TanStack Query, `@vis.gl/react-google-maps` `<Pin>`, Bun test.

---

## File Structure

- **Create** `lib/places/group-colors.ts` — `PALETTE`, `UNGROUPED_COLOR`, `defaultGroupColor`, `darken`, `isValidHexColor` (pure, tested).
- **Modify** `prisma/schema.prisma` — `PoiGroup.color`.
- **Modify** `lib/itinerary/operations.ts` — `createGroup` sets color; new `setGroupColor`.
- **Modify** `lib/itinerary/schema.ts` — `updateGroupSchema` (`name?`, `color?`).
- **Modify** `app/api/groups/[groupId]/route.ts` — PATCH applies name and/or color.
- **Modify** `lib/api/trips.ts` — `TripGroup.color`; `setGroupColorRequest`.
- **Modify** `hooks/use-group-mutations.ts` — `useSetGroupColor`.
- **Create** `components/group-color-picker.tsx` — color dot + popover (swatches + custom).
- **Modify** `components/master-list.tsx` — render the picker in each group header.
- **Modify** `components/planner-shell.tsx` — attach group color to `poiPoints`.
- **Modify** `components/trip-map.tsx` — `MapPoint.color`; `<Pin>` uses it.
- **Tests** `tests/places/group-colors.test.ts`, `tests/itinerary/groups.test.ts`.

---

### Task 1: Pure color helpers

**Files:**
- Create: `lib/places/group-colors.ts`
- Test: `tests/places/group-colors.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/places/group-colors.test.ts`:

```ts
import { test, expect, describe } from "bun:test";
import {
  PALETTE,
  UNGROUPED_COLOR,
  defaultGroupColor,
  darken,
  isValidHexColor,
} from "@/lib/places/group-colors";

describe("group-colors", () => {
  test("PALETTE entries and UNGROUPED_COLOR are valid 6-digit hex", () => {
    expect(PALETTE.length).toBeGreaterThanOrEqual(6);
    for (const c of PALETTE) expect(isValidHexColor(c)).toBe(true);
    expect(isValidHexColor(UNGROUPED_COLOR)).toBe(true);
  });

  test("defaultGroupColor wraps with modulo and is stable", () => {
    expect(defaultGroupColor(0)).toBe(PALETTE[0]);
    expect(defaultGroupColor(1)).toBe(PALETTE[1]);
    expect(defaultGroupColor(PALETTE.length)).toBe(PALETTE[0]);
    expect(defaultGroupColor(-1)).toBe(PALETTE[PALETTE.length - 1]);
  });

  test("darken returns a valid, darker 6-digit hex and clamps at 0", () => {
    expect(darken("#ffffff", 0.5)).toBe("#7f7f7f");
    expect(darken("#000000", 0.2)).toBe("#000000");
    expect(isValidHexColor(darken("#3b82f6"))).toBe(true);
  });

  test("isValidHexColor accepts #rrggbb and rejects others", () => {
    expect(isValidHexColor("#aabbcc")).toBe(true);
    expect(isValidHexColor("#ABC123")).toBe(true);
    expect(isValidHexColor("#abc")).toBe(false);
    expect(isValidHexColor("abc123")).toBe(false);
    expect(isValidHexColor("#gggggg")).toBe(false);
    expect(isValidHexColor("")).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `DATABASE_URL="file:./test.db" bun test tests/places/group-colors.test.ts`
Expected: FAIL — `Cannot find module '@/lib/places/group-colors'`.

- [ ] **Step 3: Implement**

Create `lib/places/group-colors.ts`:

```ts
/** Curated, map-legible group colors (full 6-digit hex). */
export const PALETTE: string[] = [
  "#ef4444", // red
  "#f97316", // orange
  "#eab308", // amber
  "#22c55e", // green
  "#06b6d4", // cyan
  "#3b82f6", // blue
  "#8b5cf6", // violet
  "#ec4899", // pink
];

/** Neutral color for pool / ungrouped places. */
export const UNGROUPED_COLOR = "#64748b"; // slate-500

export function isValidHexColor(s: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(s);
}

/** The palette color for a group at `orderIndex`, wrapping with modulo. */
export function defaultGroupColor(orderIndex: number): string {
  const n = PALETTE.length;
  return PALETTE[((orderIndex % n) + n) % n];
}

/** Darken a #rrggbb color toward black by `amount` (0..1) for a pin border. */
export function darken(hex: string, amount = 0.2): string {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) return hex;
  const num = parseInt(m[1], 16);
  const ch = (c: number) => Math.max(0, Math.floor(c * (1 - amount)));
  const r = ch((num >> 16) & 0xff);
  const g = ch((num >> 8) & 0xff);
  const b = ch(num & 0xff);
  return "#" + [r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("");
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `DATABASE_URL="file:./test.db" bun test tests/places/group-colors.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/places/group-colors.ts tests/places/group-colors.test.ts
git -c user.name="Anatolii Lapytskyi" -c user.email="anatolii.lapytskyi@gmail.com" commit -m "feat(places): group color palette + darken/validation helpers"
```
(Project rule: no AI co-author trailer.)

---

### Task 2: Schema column + backend (createGroup default, setGroupColor, PATCH)

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `lib/itinerary/operations.ts`
- Modify: `lib/itinerary/schema.ts`
- Modify: `app/api/groups/[groupId]/route.ts`
- Modify: `lib/api/trips.ts`
- Test: `tests/itinerary/groups.test.ts`

- [ ] **Step 1: Add the `color` column to `PoiGroup`**

In `prisma/schema.prisma`, in `model PoiGroup`, add a `color` field right after `name`:

```prisma
  name       String
  color      String   @default("#64748b")
```

- [ ] **Step 2: Push the schema to both DBs and regenerate the client**

Run each:
```bash
bunx prisma db push
DATABASE_URL="file:./test.db" bunx prisma db push
bunx prisma generate
```
Expected: each `db push` reports the schema is in sync (adds the `color` column); `generate` writes the client to `lib/generated/prisma`. (This must happen before the TypeScript below will compile against `color`.)

- [ ] **Step 3: Write the failing tests**

In `tests/itinerary/groups.test.ts`, add these imports at the top (merge into the existing import lines — `createGroup` is already imported from operations; add `setGroupColor`; add the schema + palette imports):

```ts
import { setGroupColor } from "@/lib/itinerary/operations";
import { updateGroupSchema } from "@/lib/itinerary/schema";
import { PALETTE } from "@/lib/places/group-colors";
```

Add these tests inside the existing top-level `describe(...)` block (it already has a `sampleTrip` factory, a `prisma` client, and `createTrip`/`createGroup` imports):

```ts
  test("createGroup assigns the next palette color", async () => {
    const trip = await createTrip(prisma, sampleTrip());
    const g0 = await createGroup(prisma, trip.id, "A");
    const g1 = await createGroup(prisma, trip.id, "B");
    expect(g0.color).toBe(PALETTE[0]);
    expect(g1.color).toBe(PALETTE[1]);
  });

  test("setGroupColor updates the stored color", async () => {
    const trip = await createTrip(prisma, sampleTrip());
    const g = await createGroup(prisma, trip.id, "A");
    const updated = await setGroupColor(prisma, g.id, "#123456");
    expect(updated.color).toBe("#123456");
  });

  test("updateGroupSchema validates name and color", () => {
    expect(updateGroupSchema.safeParse({ name: "X" }).success).toBe(true);
    expect(updateGroupSchema.safeParse({ color: "#aabbcc" }).success).toBe(true);
    expect(updateGroupSchema.safeParse({ color: "red" }).success).toBe(false);
    expect(updateGroupSchema.safeParse({ color: "#abc" }).success).toBe(false);
  });
```

(If `groups.test.ts` does not currently import `createGroup`, add it to the operations import. Check the file's existing imports first and merge, don't duplicate.)

- [ ] **Step 4: Run the tests to verify they fail**

Run: `DATABASE_URL="file:./test.db" bun test tests/itinerary/groups.test.ts`
Expected: FAIL — `createGroup` doesn't set `color`, `setGroupColor` doesn't exist, `updateGroupSchema` doesn't exist.

- [ ] **Step 5: Implement `createGroup` color + `setGroupColor`**

In `lib/itinerary/operations.ts`, add the import at the top (with the other imports):

```ts
import { defaultGroupColor } from "@/lib/places/group-colors";
```

Replace the `createGroup` function:

```ts
export async function createGroup(prisma: PrismaClient, tripId: string, name: string) {
  const orderIndex = await prisma.poiGroup.count({ where: { tripId } });
  return prisma.poiGroup.create({
    data: { tripId, name, orderIndex, color: defaultGroupColor(orderIndex) },
  });
}
```

Add a `setGroupColor` op right after `renameGroup`:

```ts
export async function setGroupColor(prisma: PrismaClient, groupId: string, color: string) {
  return prisma.poiGroup.update({ where: { id: groupId }, data: { color } });
}
```

- [ ] **Step 6: Add `updateGroupSchema`**

In `lib/itinerary/schema.ts`, replace the `renameGroupSchema` line with an `updateGroupSchema` (keep `createGroupSchema` as-is):

```ts
export const updateGroupSchema = z.object({
  name: z.string().min(1).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Must be a #rrggbb hex color").optional(),
});
```

(`renameGroupSchema` was only referenced by the group route — that import is updated in the next step. If anything else still imports `renameGroupSchema`, keep a back-compat alias `export const renameGroupSchema = createGroupSchema;` — but grep first; it should be unused after the route change.)

- [ ] **Step 7: Update the group PATCH route**

Replace `app/api/groups/[groupId]/route.ts`'s `PATCH` handler and imports:

```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { renameGroup, setGroupColor, deleteGroup } from "@/lib/itinerary/operations";
import { updateGroupSchema } from "@/lib/itinerary/schema";

type Ctx = { params: Promise<{ groupId: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const { groupId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = updateGroupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  let group = null;
  if (parsed.data.name !== undefined) group = await renameGroup(prisma, groupId, parsed.data.name);
  if (parsed.data.color !== undefined) group = await setGroupColor(prisma, groupId, parsed.data.color);
  if (!group) group = await prisma.poiGroup.findUnique({ where: { id: groupId } });
  return NextResponse.json(group);
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { groupId } = await params;
  await deleteGroup(prisma, groupId);
  return new NextResponse(null, { status: 204 });
}
```

- [ ] **Step 8: Add `color` to the `TripGroup` client type**

In `lib/api/trips.ts`, change:

```ts
export type TripGroup = { id: string; name: string; orderIndex: number };
```
to:
```ts
export type TripGroup = { id: string; name: string; orderIndex: number; color: string };
```

(`getTrip` includes `poiGroups` with no field `select`, so it already returns `color` — no service change needed.)

- [ ] **Step 9: Run the tests to verify they pass**

Run: `DATABASE_URL="file:./test.db" bun test tests/itinerary/groups.test.ts`
Expected: PASS.

- [ ] **Step 10: Build**

Run: `bun run build`
Expected: succeeds (the generated client now has `color`).

- [ ] **Step 11: Commit**

```bash
git add prisma/schema.prisma lib/itinerary/operations.ts lib/itinerary/schema.ts "app/api/groups/[groupId]/route.ts" lib/api/trips.ts tests/itinerary/groups.test.ts lib/generated
git -c user.name="Anatolii Lapytskyi" -c user.email="anatolii.lapytskyi@gmail.com" commit -m "feat(groups): store an editable color; auto-assign from palette on create"
```
(If `lib/generated` is gitignored, omit it from the add — check `git status` first.)

---

### Task 3: Client hook + color-picker UI + colored pins

**Files:**
- Modify: `lib/api/trips.ts`
- Modify: `hooks/use-group-mutations.ts`
- Create: `components/group-color-picker.tsx`
- Modify: `components/master-list.tsx`
- Modify: `components/planner-shell.tsx`
- Modify: `components/trip-map.tsx`

No unit tests (UI); verify with `bun run build` and the live smoke test in Task 4.

- [ ] **Step 1: Add the fetcher**

In `lib/api/trips.ts`, add near `renameGroupRequest`:

```ts
export async function setGroupColorRequest(groupId: string, color: string): Promise<void> {
  const res = await fetch(`/api/groups/${groupId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ color }),
  });
  if (!res.ok) throw new Error(`Failed to set group color (${res.status})`);
}
```

- [ ] **Step 2: Add the hook**

In `hooks/use-group-mutations.ts`, add `setGroupColorRequest` to the imports from `@/lib/api/trips`, and add this hook:

```ts
export function useSetGroupColor(tripId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { groupId: string; color: string }) => setGroupColorRequest(v.groupId, v.color),
    onSuccess: () => qc.invalidateQueries({ queryKey: tripQueryKey(tripId) }),
  });
}
```

- [ ] **Step 3: Create the color picker**

Create `components/group-color-picker.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { PALETTE } from "@/lib/places/group-colors";

export function GroupColorPicker({
  color,
  label,
  onChange,
}: {
  color: string;
  label: string;
  onChange: (hex: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        aria-label={`Color for ${label}`}
        className="h-4 w-4 rounded-full border"
        style={{ background: color }}
        onClick={() => setOpen((o) => !o)}
      />
      {open && (
        <div className="absolute z-30 mt-1 w-40 rounded-md border bg-background p-2 shadow-md">
          <div className="grid grid-cols-4 gap-1">
            {PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Set color ${c}`}
                className="h-6 w-6 rounded-full border"
                style={{ background: c }}
                onClick={() => {
                  onChange(c);
                  setOpen(false);
                }}
              />
            ))}
          </div>
          <label className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
            Custom
            <input
              type="color"
              value={color}
              onChange={(e) => onChange(e.target.value)}
              className="h-6 w-8 cursor-pointer border-0 bg-transparent p-0"
              aria-label={`Custom color for ${label}`}
            />
          </label>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Render the picker in the group header**

In `components/master-list.tsx`, add to the hook imports:

```tsx
import { useCreateGroup, useRenameGroup, useDeleteGroup, useMoveToGroup, useSetGroupColor } from "@/hooks/use-group-mutations";
import { GroupColorPicker } from "@/components/group-color-picker";
```

Inside `MasterList`, after `const deleteGroup = useDeleteGroup(tripId);`, add:

```tsx
  const setGroupColor = useSetGroupColor(tripId);
```

Replace the group header `<div className="mb-1 flex items-center justify-between">` block (the one containing the name `<input>` and the delete `<button>`) with:

```tsx
            <div className="mb-1 flex items-center gap-2">
              <GroupColorPicker
                color={g.color}
                label={g.name}
                onChange={(hex) => setGroupColor.mutate({ groupId: g.id, color: hex })}
              />
              <input
                key={g.name}
                className="flex-1 bg-transparent text-xs font-semibold uppercase tracking-wide text-muted-foreground outline-none"
                defaultValue={g.name}
                onBlur={(e) => {
                  const name = e.target.value.trim();
                  if (name && name !== g.name) renameGroup.mutate({ groupId: g.id, name });
                }}
                aria-label={`Group name ${g.name}`}
              />
              <button
                type="button"
                aria-label={`Delete group ${g.name}`}
                className="px-1 text-xs text-muted-foreground hover:text-red-600"
                onClick={() => deleteGroup.mutate(g.id)}
              >
                ✕
              </button>
            </div>
```

- [ ] **Step 5: Add `color` to `MapPoint` and use it in the pin**

In `components/trip-map.tsx`, change the `MapPoint` type:

```tsx
export type MapPoint = { lat: number; lng: number; name: string; id?: string; color?: { background: string; border: string } };
```

Replace the POI markers block:

```tsx
      {pois.map((p, i) => (
        <AdvancedMarker key={p.id ?? i} position={p} title={p.name}>
          <Pin />
        </AdvancedMarker>
      ))}
```
with:
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

- [ ] **Step 6: Attach each POI's group color in the planner**

In `components/planner-shell.tsx`, add the import:

```tsx
import { darken, UNGROUPED_COLOR } from "@/lib/places/group-colors";
```

Find the existing `poiPoints` definition:

```tsx
  const poiPoints: MapPoint[] = trip.pois.map((p) => ({ lat: p.lat, lng: p.lng, name: p.name, id: p.id }));
```
Replace it with:
```tsx
  const groupColorById = new Map(trip.poiGroups.map((g) => [g.id, g.color]));
  const poiPoints: MapPoint[] = trip.pois.map((p) => {
    const bg = (p.groupId && groupColorById.get(p.groupId)) || UNGROUPED_COLOR;
    return { lat: p.lat, lng: p.lng, name: p.name, id: p.id, color: { background: bg, border: darken(bg) } };
  });
```

- [ ] **Step 7: Build**

Run: `bun run build`
Expected: succeeds.

- [ ] **Step 8: Commit**

```bash
git add lib/api/trips.ts hooks/use-group-mutations.ts components/group-color-picker.tsx components/master-list.tsx components/planner-shell.tsx components/trip-map.tsx
git -c user.name="Anatolii Lapytskyi" -c user.email="anatolii.lapytskyi@gmail.com" commit -m "feat(planner): color group markers; editable color dot in the group header"
```

---

### Task 4: Verification

**Files:** none (validation only)

- [ ] **Step 1: Full test suite**

Run: `bun run test`
Expected: all pass (new `group-colors` tests + group service tests + everything prior).

- [ ] **Step 2: Production build**

Run: `bun run build`
Expected: succeeds.

- [ ] **Step 3: Live smoke test**

Start `bun run dev`, open a trip and add a few places. Verify:
1. Create 2–3 groups → each header dot shows a distinct palette color (group 1 red, group 2 orange, …).
2. Assign places into groups (drag or the per-row select) → each place's map pin takes its group's color; ungrouped places are neutral slate.
3. Click a group's color dot → a popover shows the preset swatches plus a "Custom" picker. Pick a preset → the dot and that group's pins update immediately. Use the custom picker → same.
4. Reorder groups → colors stay put (color is stored, not positional).
5. No console errors.

- [ ] **Step 4: Final review + merge**

Dispatch a final code review over the branch diff, fix anything above threshold, then merge to `main` per superpowers:finishing-a-development-branch.

---

## Notes for the implementer

- **No new endpoints** — the existing group PATCH gains an optional `color`.
- **`getTrip` already returns the whole group**, so `color` flows to the client once the column and `TripGroup` type exist.
- **`trip-map` stays presentational** — it receives already-computed `{ background, border }`; the planner owns the group→color lookup (and `darken`), so the map file imports no color logic.
- The custom `<input type="color">` commits on change; a handful of extra PATCHes while dragging the OS picker is acceptable for this single-user tool.
</content>
