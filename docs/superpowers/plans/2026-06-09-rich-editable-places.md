# Rich, Editable Places Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Save a place's photo/address/description when added, and let the user edit a saved place's name/description/image (image via URL), with a sidebar thumbnail and a modal editor.

**Architecture:** Add `imageUrl`/`description` columns to `Poi` (reuse `address`); persist them on add from the map preview; add an `op:"edit"` to the poi PATCH for `updatePoi`. A `PlaceEditor` modal edits a place; `catalog-row` shows a thumbnail + edit button.

**Tech Stack:** Next.js 16 / React 19, TypeScript, Prisma 7 (libSQL) + `prisma db push`, Zod 4, TanStack Query, Bun test.

---

## File Structure

- **Modify** `prisma/schema.prisma` — `Poi.imageUrl` (rename from `photoRef`), `Poi.description`.
- **Modify** `lib/itinerary/operations.ts` — `AddPoiInput` fields; `addPoi` persists them; new `updatePoi`.
- **Modify** `lib/itinerary/schema.ts` — `addPoiSchema` fields; `patchPoiSchema` `edit` variant.
- **Modify** `app/api/pois/[poiId]/route.ts` — handle `op:"edit"`.
- **Modify** `lib/api/trips.ts` — `PoiDetail` fields; `updatePoiRequest`.
- **Modify** `hooks/use-poi-mutations.ts` — `useUpdatePoi`.
- **Create** `components/place-editor.tsx` — the modal.
- **Modify** `components/place-preview.tsx` — add-payload fields.
- **Modify** `components/planner-shell.tsx` — forward add fields.
- **Modify** `components/catalog-row.tsx` — thumbnail + edit button.
- **Tests** `tests/itinerary/operations.test.ts`.

---

### Task 1: Schema columns + persist on add

**Files:**
- Modify: `prisma/schema.prisma`, `lib/itinerary/operations.ts`, `lib/itinerary/schema.ts`
- Test: `tests/itinerary/operations.test.ts`

- [ ] **Step 1: Add the columns**

In `prisma/schema.prisma`, in `model Poi`, replace the line `  photoRef     String?` with `  imageUrl     String?`, and add a `description` field right after the `address` line:

```prisma
  imageUrl     String?
  address      String?
  description  String?
```

- [ ] **Step 2: Push + regenerate**

Run:
```bash
bunx prisma db push
DATABASE_URL="file:./test.db" bunx prisma db push
bunx prisma generate
```
Expected: both `db push` sync (drop `photoRef`, add `imageUrl`/`description`); `generate` writes the client. (`lib/generated` is gitignored — don't commit it.)

- [ ] **Step 3: Write the failing test**

In `tests/itinerary/operations.test.ts`, add this test inside the `describe("addPoi", ...)` block (the file has a `sampleTrip()` factory + `createTrip`/`addPoi` imports):

```ts
  test("addPoi persists address, description and imageUrl", async () => {
    const trip = await createTrip(prisma, sampleTrip());
    const poi = await addPoi(prisma, trip.id, {
      name: "Uffizi",
      lat: 43.76,
      lng: 11.25,
      address: "Piazzale degli Uffizi, Firenze",
      description: "Renaissance gallery",
      imageUrl: "https://example.com/uffizi.jpg",
    });
    expect(poi.address).toBe("Piazzale degli Uffizi, Firenze");
    expect(poi.description).toBe("Renaissance gallery");
    expect(poi.imageUrl).toBe("https://example.com/uffizi.jpg");
  });
```

(If the file's tests are not wrapped in a `describe("addPoi")`, add it at the top level of the existing `describe(...)` instead — match the file's structure.)

- [ ] **Step 4: Run the test to verify it fails**

Run: `DATABASE_URL="file:./test.db" bun test tests/itinerary/operations.test.ts`
Expected: FAIL — `addPoi` doesn't accept/persist these fields (TS/runtime: the create ignores them and `poi.address` is null).

- [ ] **Step 5: Extend `AddPoiInput` and `addPoi`**

In `lib/itinerary/operations.ts`, add three fields to the `AddPoiInput` type (after `groupId?`):

```ts
  address?: string | null;
  description?: string | null;
  imageUrl?: string | null;
```

In the `addPoi` op's `prisma.poi.create({ data: { ... } })`, add three fields after `category`:

```ts
      address: input.address ?? null,
      description: input.description ?? null,
      imageUrl: input.imageUrl ?? null,
```

- [ ] **Step 6: Extend `addPoiSchema`**

In `lib/itinerary/schema.ts`, add to the `addPoiSchema` object (after `groupId`):

```ts
  address: z.string().optional(),
  description: z.string().optional(),
  imageUrl: z.string().optional(),
```

(On add these come from Google and are trusted; no `.url()` here. The edit path validates the URL in Task 2.)

- [ ] **Step 7: Run the test to verify it passes**

Run: `DATABASE_URL="file:./test.db" bun test tests/itinerary/operations.test.ts`
Expected: PASS.

- [ ] **Step 8: Build**

Run: `bun run build`
Expected: succeeds.

- [ ] **Step 9: Commit**

```bash
git add prisma/schema.prisma lib/itinerary/operations.ts lib/itinerary/schema.ts tests/itinerary/operations.test.ts
git status --short
git -c user.name="Anatolii Lapytskyi" -c user.email="anatolii.lapytskyi@gmail.com" commit -m "feat(poi): persist address/description/imageUrl on add (imageUrl replaces photoRef)"
```
(Project rule: no AI co-author trailer. Do NOT add `lib/generated` — gitignored.)

---

### Task 2: `updatePoi` op + edit PATCH + client type/fetcher/hook

**Files:**
- Modify: `lib/itinerary/operations.ts`, `lib/itinerary/schema.ts`, `app/api/pois/[poiId]/route.ts`, `lib/api/trips.ts`, `hooks/use-poi-mutations.ts`
- Test: `tests/itinerary/operations.test.ts`

- [ ] **Step 1: Write the failing tests**

In `tests/itinerary/operations.test.ts`, add `updatePoi` to the operations import, add `patchPoiSchema` import (`import { patchPoiSchema } from "@/lib/itinerary/schema";`), and add these tests inside the top-level `describe(...)`:

```ts
  test("updatePoi updates name, description and imageUrl", async () => {
    const trip = await createTrip(prisma, sampleTrip());
    const poi = await addPoi(prisma, trip.id, { name: "X", lat: 1, lng: 2 });
    const updated = await updatePoi(prisma, poi.id, {
      name: "Renamed",
      description: "New note",
      imageUrl: "https://example.com/new.jpg",
    });
    expect(updated.name).toBe("Renamed");
    expect(updated.description).toBe("New note");
    expect(updated.imageUrl).toBe("https://example.com/new.jpg");
  });

  test("updatePoi can clear description and imageUrl with null", async () => {
    const trip = await createTrip(prisma, sampleTrip());
    const poi = await addPoi(prisma, trip.id, {
      name: "X", lat: 1, lng: 2, description: "d", imageUrl: "https://e.com/i.jpg",
    });
    const updated = await updatePoi(prisma, poi.id, { description: null, imageUrl: null });
    expect(updated.description).toBeNull();
    expect(updated.imageUrl).toBeNull();
    expect(updated.name).toBe("X"); // untouched
  });

  test("patchPoiSchema edit variant validates fields", () => {
    expect(patchPoiSchema.safeParse({ op: "edit", name: "Y" }).success).toBe(true);
    expect(patchPoiSchema.safeParse({ op: "edit", imageUrl: null }).success).toBe(true);
    expect(patchPoiSchema.safeParse({ op: "edit", imageUrl: "https://e.com/i.jpg" }).success).toBe(true);
    expect(patchPoiSchema.safeParse({ op: "edit", imageUrl: "not a url" }).success).toBe(false);
    expect(patchPoiSchema.safeParse({ op: "edit", name: "" }).success).toBe(false);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `DATABASE_URL="file:./test.db" bun test tests/itinerary/operations.test.ts`
Expected: FAIL — `updatePoi` and the `edit` schema variant don't exist.

- [ ] **Step 3: Implement `updatePoi`**

In `lib/itinerary/operations.ts`, add after the `addPoi` function:

```ts
export async function updatePoi(
  prisma: PrismaClient,
  poiId: string,
  patch: { name?: string; description?: string | null; imageUrl?: string | null },
) {
  const data: { name?: string; description?: string | null; imageUrl?: string | null } = {};
  if (patch.name !== undefined) data.name = patch.name;
  if (patch.description !== undefined) data.description = patch.description;
  if (patch.imageUrl !== undefined) data.imageUrl = patch.imageUrl;
  return prisma.poi.update({ where: { id: poiId }, data });
}
```

- [ ] **Step 4: Add the `edit` variant to `patchPoiSchema`**

In `lib/itinerary/schema.ts`, add a third member to the `patchPoiSchema` discriminated union (after the `group` member, inside the array):

```ts
  z.object({
    op: z.literal("edit"),
    name: z.string().min(1).optional(),
    description: z.string().nullable().optional(),
    imageUrl: z.string().url().nullable().optional(),
  }),
```

- [ ] **Step 5: Handle `op:"edit"` in the poi PATCH route**

In `app/api/pois/[poiId]/route.ts`, add `updatePoi` to the operations import, and change the op dispatch in `PATCH`. Replace:

```ts
    let poi;
    if (data.op === "move") {
      poi = await movePoi(prisma, poiId, { dayId: data.dayId, orderInDay: data.orderInDay });
    } else {
      poi = await moveToGroup(prisma, poiId, data.groupId, data.orderInGroup);
    }
```
with:
```ts
    let poi;
    if (data.op === "move") {
      poi = await movePoi(prisma, poiId, { dayId: data.dayId, orderInDay: data.orderInDay });
    } else if (data.op === "group") {
      poi = await moveToGroup(prisma, poiId, data.groupId, data.orderInGroup);
    } else {
      poi = await updatePoi(prisma, poiId, {
        name: data.name,
        description: data.description,
        imageUrl: data.imageUrl,
      });
    }
```

- [ ] **Step 6: Add the fields to `PoiDetail` + a fetcher**

In `lib/api/trips.ts`, add to the `PoiDetail` type (after `orderInGroup`):

```ts
  address: string | null;
  description: string | null;
  imageUrl: string | null;
```

Add a fetcher near `patchPoiMove`:

```ts
export async function updatePoiRequest(
  poiId: string,
  patch: { name?: string; description?: string | null; imageUrl?: string | null },
): Promise<void> {
  const res = await fetch(`/api/pois/${poiId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ op: "edit", ...patch }),
  });
  if (!res.ok) throw new Error(`Failed to update place (${res.status})`);
}
```

- [ ] **Step 7: Add the `useUpdatePoi` hook**

In `hooks/use-poi-mutations.ts`, add `updatePoiRequest` to the import from `@/lib/api/trips`, and add:

```ts
export function useUpdatePoi(tripId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { poiId: string; name?: string; description?: string | null; imageUrl?: string | null }) => {
      const { poiId, ...patch } = v;
      return updatePoiRequest(poiId, patch);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: tripQueryKey(tripId) }),
  });
}
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `DATABASE_URL="file:./test.db" bun test tests/itinerary/operations.test.ts`
Expected: PASS.

- [ ] **Step 9: Build**

Run: `bun run build`
Expected: succeeds.

- [ ] **Step 10: Commit**

```bash
git add lib/itinerary/operations.ts lib/itinerary/schema.ts "app/api/pois/[poiId]/route.ts" lib/api/trips.ts hooks/use-poi-mutations.ts tests/itinerary/operations.test.ts
git -c user.name="Anatolii Lapytskyi" -c user.email="anatolii.lapytskyi@gmail.com" commit -m "feat(poi): editable name/description/imageUrl via PATCH op:edit"
```

---

### Task 3: Add-payload fields + PlaceEditor modal + row thumbnail

**Files:**
- Modify: `components/place-preview.tsx`, `components/planner-shell.tsx`, `components/catalog-row.tsx`
- Create: `components/place-editor.tsx`

No unit tests (UI); verify with `bun run build` + the live smoke test in Task 4.

- [ ] **Step 1: Pass the preview's address/description/image into the add**

In `components/place-preview.tsx`, find the `onAdd({ ... })` call and replace it with:

```tsx
          onAdd({
            name: details.name,
            lat: details.lat,
            lng: details.lng,
            placeId,
            category: categoryFromTypes(details.types),
            source,
            address: details.address,
            description: details.description,
            imageUrl: details.photoUrl,
          })
```

(`details` already holds `address`, `description`, and `photoUrl`.)

- [ ] **Step 2: Forward them in the planner**

In `components/planner-shell.tsx`, replace the `handleAddFromMap` body's `addPoi.mutate({ ... })` with:

```tsx
    addPoi.mutate({
      name: input.name,
      lat: input.lat,
      lng: input.lng,
      placeId: input.placeId ?? undefined,
      category: input.category ?? undefined,
      source: input.source ?? "map",
      address: input.address ?? undefined,
      description: input.description ?? undefined,
      imageUrl: input.imageUrl ?? undefined,
    });
```

(Leave the `setPreview(null);` line that follows.)

- [ ] **Step 3: Create the modal `components/place-editor.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useUpdatePoi } from "@/hooks/use-poi-mutations";
import type { PoiDetail } from "@/lib/api/trips";

export function PlaceEditor({
  poi,
  tripId,
  onClose,
}: {
  poi: PoiDetail;
  tripId: string;
  onClose: () => void;
}) {
  const updatePoi = useUpdatePoi(tripId);
  const [name, setName] = useState(poi.name);
  const [description, setDescription] = useState(poi.description ?? "");
  const [imageUrl, setImageUrl] = useState(poi.imageUrl ?? "");
  const [imgBroken, setImgBroken] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function save() {
    updatePoi.mutate({
      poiId: poi.id,
      name: name.trim() || poi.name,
      description: description.trim() || null,
      imageUrl: imageUrl.trim() || null,
    });
    onClose();
  }

  const url = imageUrl.trim();

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="w-80 max-w-[90vw] rounded-md border bg-background p-4 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-2 text-sm font-semibold">Edit place</h3>
        <div className="space-y-2">
          <div>
            <Label htmlFor="pe-name" className="text-xs">Name</Label>
            <Input id="pe-name" value={name} onChange={(e) => setName(e.target.value)} className="h-8 text-sm" />
          </div>
          <div>
            <Label htmlFor="pe-desc" className="text-xs">Description</Label>
            <Textarea id="pe-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="text-sm" />
          </div>
          <div>
            <Label htmlFor="pe-img" className="text-xs">Image URL</Label>
            <Input
              id="pe-img"
              value={imageUrl}
              onChange={(e) => {
                setImageUrl(e.target.value);
                setImgBroken(false);
              }}
              placeholder="https://…"
              className="h-8 text-sm"
            />
            {url && !imgBroken ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={url}
                alt={name}
                onError={() => setImgBroken(true)}
                className="mt-1 h-28 w-full rounded object-cover"
              />
            ) : null}
          </div>
          {poi.address ? (
            <div className="text-xs text-muted-foreground">{poi.address}</div>
          ) : null}
        </div>
        <div className="mt-3 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={save} disabled={updatePoi.isPending}>Save</Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Add a thumbnail + edit button to `catalog-row.tsx`**

In `components/catalog-row.tsx`, add to the imports:

```tsx
import { useState } from "react";
import { PlaceEditor } from "@/components/place-editor";
```

Inside `CatalogRow`, after the `movePoi` declaration, add:

```tsx
  const [editing, setEditing] = useState(false);
  const [thumbBroken, setThumbBroken] = useState(false);
```

Replace the row's contents — currently the `<li>` holds: drag handle, `<span>{poi.name}</span>`, the day `<select>`, and the delete `<button>`. Replace the drag-handle + name span region:

```tsx
      <span ref={handleRef} aria-label="Drag to a group" className="cursor-grab select-none px-1 text-muted-foreground">
        ⠿
      </span>
      <span className="flex-1 truncate">{poi.name}</span>
```
with:
```tsx
      <span ref={handleRef} aria-label="Drag to a group" className="cursor-grab select-none px-1 text-muted-foreground">
        ⠿
      </span>
      {poi.imageUrl && !thumbBroken ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={poi.imageUrl}
          alt=""
          onError={() => setThumbBroken(true)}
          className="h-7 w-7 shrink-0 rounded object-cover"
        />
      ) : null}
      <span className="flex-1 truncate">{poi.name}</span>
      <button
        type="button"
        aria-label={`Edit ${poi.name}`}
        className="px-1 text-muted-foreground hover:text-foreground"
        onClick={() => setEditing(true)}
      >
        ✎
      </button>
```

And just before the closing `</li>`, add the modal:

```tsx
      {editing ? <PlaceEditor poi={poi} tripId={tripId} onClose={() => setEditing(false)} /> : null}
```

- [ ] **Step 5: Build**

Run: `bun run build`
Expected: succeeds.

- [ ] **Step 6: Commit**

```bash
git add components/place-preview.tsx components/planner-shell.tsx components/catalog-row.tsx components/place-editor.tsx
git -c user.name="Anatolii Lapytskyi" -c user.email="anatolii.lapytskyi@gmail.com" commit -m "feat(places): save preview photo/address/description on add; edit modal + row thumbnail"
```

---

### Task 4: Verification

**Files:** none (validation only)

- [ ] **Step 1: Full test suite**

Run: `bun run test`
Expected: all pass (new addPoi/updatePoi/schema tests + everything prior).

- [ ] **Step 2: Production build**

Run: `bun run build`
Expected: succeeds.

- [ ] **Step 3: Live smoke test**

Start `bun run dev`, open a trip. Verify:
1. Search/click a place → in the preview popup, Add to Places → the place is saved; reload and confirm via the API (or UI) that its `address`, `description`, and `imageUrl` are stored, and a **thumbnail** shows on its row in the master list.
2. Click the **✎** edit button on a place row → the modal opens with name, description, image-URL (with a live preview) and the read-only address.
3. Edit the name and description, paste a different image URL (preview updates) → Save → the row's name and thumbnail update.
4. Clear the image URL → Save → the thumbnail disappears from the row.
5. Paste an invalid URL (e.g. `not a url`) → Save is rejected by the API (400) — the place is unchanged. (The image preview also hides on a broken/dead link.)
6. No console errors.

- [ ] **Step 4: Final review + merge**

Dispatch a final code review over the branch diff, fix anything above threshold, then merge to `main` per superpowers:finishing-a-development-branch.

---

## Notes for the implementer

- **`getTrip` returns the whole `Poi` row** (no field `select`), so `address`/`description`/`imageUrl` reach the client once the columns + `PoiDetail` type exist.
- **The pois POST route** passes the parsed `addPoiSchema` body straight to `addPoi`, so the new optional add-fields flow without a route change — confirm `app/api/trips/[tripId]/pois/route.ts` does `addPoi(prisma, tripId, parsed.data)` (it does) and needs no edit.
- **Add trusts Google** for the image (plain string); **edit validates** the URL (`z.string().url()`), clearing via `null` (empty input → null).
- **The thumbnail and the editor preview both hide on a load error** (`onError`), so a dead link never breaks the layout.
</content>
