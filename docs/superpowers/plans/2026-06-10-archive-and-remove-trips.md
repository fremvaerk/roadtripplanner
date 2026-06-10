# Archive & Remove Trips Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user archive a trip (a reversible soft-hide) and permanently remove a trip, with controls on both the trips list and the trip detail header.

**Architecture:** Add a nullable `archivedAt` timestamp to `Trip` (`null` = active). Archive/restore reuse the existing general `updateTrip` patch function and `PATCH /api/trips/[tripId]`; permanent remove reuses the existing `deleteTrip` / `DELETE /api/trips/[tripId]` (cascades). The trips list becomes a client component that splits active vs archived behind a toggle and re-pulls via `router.refresh()`; the detail header uses a TanStack mutation for archive/restore and navigates home after remove. A small custom `ConfirmDialog` guards permanent removal.

**Tech Stack:** Next.js 16 (App Router, RSC), React 19, TypeScript, Prisma 7 + libSQL adapter, TanStack Query v5, Tailwind v4, shadcn/ui (Button), Bun (`bun run test`, `bun run build`).

---

## Reference: conventions you must follow

- **Package manager is Bun.** Tests: `bun run test` (pushes the schema to `test.db` then runs `bun test`). Build: `bun run build`.
- **Prisma client** is generated to `@/lib/generated/prisma/client` and is gitignored. After any `schema.prisma` change you MUST run `bunx prisma generate` or imports break.
- **The dev database is `dev.db`; tests use `test.db`.** A schema change must be pushed to BOTH.
- Existing fetch-helpers live in `lib/api/trips.ts` and follow this exact shape:
  ```ts
  export async function setTripBaseRequest(tripId: string, patch: TripBasePatch): Promise<void> {
    const res = await fetch(`/api/trips/${tripId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) throw new Error(`Failed to update trip (${res.status})`);
  }
  ```
- TanStack mutation hooks live in `hooks/use-trip-mutations.ts` and invalidate `tripQueryKey(tripId)` from `hooks/use-trip.ts`.
- Service tests live in `tests/trips/service.test.ts`; schema tests in `tests/trips/schema.test.ts`. Both run against `test.db` via a libSQL `PrismaClient`.

---

## File Structure

| File | Responsibility | Action |
|------|----------------|--------|
| `prisma/schema.prisma` | Add `archivedAt DateTime?` to `Trip` | Modify |
| `lib/trips/service.ts` | `updateTrip` handles `archived` | Modify |
| `tests/trips/service.test.ts` | archive set/clear + delete-cascades-pois tests | Modify |
| `lib/trips/schema.ts` | `updateTripSchema` accepts `archived` | Modify |
| `tests/trips/schema.test.ts` | `archived` validation tests | Modify |
| `lib/api/trips.ts` | `archiveTripRequest`, `deleteTripRequest`, `archivedAt` on `TripDetail` | Modify |
| `components/confirm-dialog.tsx` | Reusable confirm modal | Create |
| `components/trips-list.tsx` | Client list: active/archived toggle + per-row actions | Create |
| `app/page.tsx` | Server component → maps trips → `<TripsList>` | Modify |
| `hooks/use-trip-mutations.ts` | `useArchiveTrip` | Modify |
| `components/planner-shell.tsx` | Header badge + Archive/Restore/Remove | Modify |

---

## Task 1: Data model + `updateTrip` archive support

**Files:**
- Modify: `prisma/schema.prisma` (the `Trip` model)
- Modify: `lib/trips/service.ts:52-91` (`updateTrip`)
- Test: `tests/trips/service.test.ts`

- [ ] **Step 1: Add the `archivedAt` column to the schema**

In `prisma/schema.prisma`, inside `model Trip { … }`, add the field right after the `params` line (before `createdAt`):

```prisma
  archivedAt   DateTime?
```

- [ ] **Step 2: Push the schema to both databases and regenerate the client**

Run each command and confirm it succeeds:

```bash
bunx prisma db push
DATABASE_URL="file:./test.db" bunx prisma db push
bunx prisma generate
```

Expected: each `db push` ends with "Your database is now in sync with your Prisma schema" (or "already in sync"), and `generate` ends with "Generated Prisma Client".

- [ ] **Step 3: Write the failing tests**

In `tests/trips/service.test.ts`, add these tests inside the `describe("trip service", () => { … })` block (after the existing `deleteTrip` test, before the closing `})`):

```ts
  test("updateTrip archives and restores a trip via archivedAt", async () => {
    const created = await createTrip(prisma, sampleData());
    expect(created.archivedAt).toBeNull();

    const archived = await updateTrip(prisma, created.id, { archived: true });
    expect(archived.archivedAt).toBeInstanceOf(Date);

    const restored = await updateTrip(prisma, created.id, { archived: false });
    expect(restored.archivedAt).toBeNull();
  });

  test("updateTrip leaves archivedAt untouched when archived is omitted", async () => {
    const created = await createTrip(prisma, sampleData());
    await updateTrip(prisma, created.id, { archived: true });
    const renamed = await updateTrip(prisma, created.id, { title: "Renamed" });
    expect(renamed.archivedAt).toBeInstanceOf(Date);
  });

  test("listTrips includes archived trips", async () => {
    const created = await createTrip(prisma, sampleData({ title: "A" }));
    await updateTrip(prisma, created.id, { archived: true });
    const trips = await listTrips(prisma);
    expect(trips).toHaveLength(1);
    expect(trips[0].archivedAt).toBeInstanceOf(Date);
  });

  test("deleteTrip cascades to pois", async () => {
    const created = await createTrip(prisma, sampleData());
    await prisma.poi.create({
      data: {
        tripId: created.id,
        name: "Gelato stop",
        lat: 43.77,
        lng: 11.25,
        placeId: null,
        source: "manual",
        status: "unassigned",
      },
    });
    expect(await prisma.poi.count()).toBe(1);
    await deleteTrip(prisma, created.id);
    expect(await prisma.poi.count()).toBe(0);
  });
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `bun run test 2>&1 | tail -8`
Expected: FAIL — the archive tests fail because `updateTrip` ignores `archived` (so `archivedAt` stays `null`), surfacing as `expect(archived.archivedAt).toBeInstanceOf(Date)` failing. (The `deleteTrip cascades to pois` test should already pass; that's fine.)

- [ ] **Step 5: Implement `archived` in `updateTrip`**

In `lib/trips/service.ts`, edit the `updateTrip` patch type to add `archived`, and add the assignment. The patch type (lines 55-61) becomes:

```ts
  patch: {
    title?: string;
    description?: string;
    startDate?: Date | null;
    start?: TripPlace;
    finish?: { mode: "open" | "round" | "place"; place?: TripPlace };
    archived?: boolean;
  },
```

Then, immediately after the `if (patch.startDate !== undefined) data.startDate = patch.startDate;` line (line 66), add:

```ts
  if (patch.archived !== undefined) {
    data.archivedAt = patch.archived ? new Date() : null;
  }
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `bun run test 2>&1 | tail -8`
Expected: PASS — all tests green (the suite was 155; it is now 159).

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma lib/trips/service.ts tests/trips/service.test.ts
git commit -m "feat(trips): archivedAt column + updateTrip archive/restore"
```

---

## Task 2: API schema + client request helpers

**Files:**
- Modify: `lib/trips/schema.ts` (`updateTripSchema`)
- Test: `tests/trips/schema.test.ts`
- Modify: `lib/api/trips.ts` (`TripDetail` type + two helpers)

- [ ] **Step 1: Write the failing schema tests**

In `tests/trips/schema.test.ts`, add these tests inside the `describe("updateTripSchema", () => { … })` block (before its closing `})`):

```ts
  test("accepts an archived boolean", () => {
    expect(updateTripSchema.safeParse({ archived: true }).success).toBe(true);
    expect(updateTripSchema.safeParse({ archived: false }).success).toBe(true);
  });

  test("rejects a non-boolean archived", () => {
    expect(updateTripSchema.safeParse({ archived: "yes" }).success).toBe(false);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun run test 2>&1 | tail -8`
Expected: FAIL — `accepts an archived boolean` fails because `updateTripSchema` strips unknown keys but `rejects a non-boolean archived` fails (an unknown key is ignored, so `"yes"` parses as success). At least one assertion fails.

- [ ] **Step 3: Add `archived` to `updateTripSchema`**

In `lib/trips/schema.ts`, in the `updateTripSchema` object, add this line after `startDate: isoDate.nullable().optional(),`:

```ts
  archived: z.boolean().optional(),
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun run test 2>&1 | tail -8`
Expected: PASS (suite now 161).

- [ ] **Step 5: Add `archivedAt` to the `TripDetail` type**

In `lib/api/trips.ts`, in the `TripDetail` type (lines 34-50), add this line after `startDate: string | null;`:

```ts
  archivedAt: string | null;
```

(The `GET /api/trips/[tripId]` handler returns the full `getTrip` result, which now includes `archivedAt`, so no route change is needed — only the type.)

- [ ] **Step 6: Add the two request helpers**

In `lib/api/trips.ts`, append these two functions at the end of the file:

```ts
export async function archiveTripRequest(tripId: string, archived: boolean): Promise<void> {
  const res = await fetch(`/api/trips/${tripId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ archived }),
  });
  if (!res.ok) throw new Error(`Failed to ${archived ? "archive" : "restore"} trip (${res.status})`);
}

export async function deleteTripRequest(tripId: string): Promise<void> {
  const res = await fetch(`/api/trips/${tripId}`, { method: "DELETE" });
  // 204 = deleted, 404 = already gone — both are success for our purposes.
  if (!res.ok && res.status !== 404) {
    throw new Error(`Failed to remove trip (${res.status})`);
  }
}
```

- [ ] **Step 7: Verify it builds**

Run: `bun run build 2>&1 | tail -5`
Expected: "✓ Compiled successfully" with no type errors.

- [ ] **Step 8: Commit**

```bash
git add lib/trips/schema.ts tests/trips/schema.test.ts lib/api/trips.ts
git commit -m "feat(trips): archived in update schema + archive/delete request helpers"
```

---

## Task 3: `ConfirmDialog` component

**Files:**
- Create: `components/confirm-dialog.tsx`

This mirrors the `NightEditor` modal pattern (centered, `fixed inset-0` backdrop, Esc/Cancel/backdrop to dismiss). No external dependency.

- [ ] **Step 1: Create the component**

Create `components/confirm-dialog.tsx` with exactly:

```tsx
"use client";

import { useEffect, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Remove",
  pending = false,
  onConfirm,
  onClose,
}: {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  pending?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pending) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, pending]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={() => {
        if (!pending) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-80 max-w-[90vw] rounded-md border bg-background p-4 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-2 text-sm font-semibold">{title}</h3>
        <div className="mb-4 text-sm text-muted-foreground">{message}</div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={onConfirm}
            disabled={pending}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it builds**

Run: `bun run build 2>&1 | tail -5`
Expected: "✓ Compiled successfully" (the component is not yet imported anywhere, but it must type-check).

- [ ] **Step 3: Commit**

```bash
git add components/confirm-dialog.tsx
git commit -m "feat: reusable ConfirmDialog modal"
```

---

## Task 4: Trips list — toggle + per-row actions

**Files:**
- Create: `components/trips-list.tsx`
- Modify: `app/page.tsx`

The current `app/page.tsx` is a server component that renders the list inline. Move the list markup into a client component and add archive/restore/remove plus the archived toggle.

- [ ] **Step 1: Create the client list component**

Create `components/trips-list.tsx` with exactly:

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { archiveTripRequest, deleteTripRequest } from "@/lib/api/trips";
import { ConfirmDialog } from "@/components/confirm-dialog";

export type TripListItem = {
  id: string;
  title: string;
  startName: string;
  endName: string | null;
  isRoundTrip: boolean;
  archivedAt: string | null;
};

function subtitle(t: TripListItem): string {
  if (t.isRoundTrip) return `${t.startName} ↺ round trip`;
  return `${t.startName}${t.endName ? ` → ${t.endName}` : " → (open)"}`;
}

export function TripsList({ trips }: { trips: TripListItem[] }) {
  const router = useRouter();
  const [showArchived, setShowArchived] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [removing, setRemoving] = useState<TripListItem | null>(null);

  const active = trips.filter((t) => !t.archivedAt);
  const archived = trips
    .filter((t) => t.archivedAt)
    .sort((a, b) => (a.archivedAt! < b.archivedAt! ? 1 : -1));

  async function setArchived(id: string, value: boolean) {
    setBusyId(id);
    try {
      await archiveTripRequest(id, value);
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusyId(null);
    }
  }

  async function confirmRemove() {
    if (!removing) return;
    const id = removing.id;
    setBusyId(id);
    try {
      await deleteTripRequest(id);
      setRemoving(null);
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Remove failed");
    } finally {
      setBusyId(null);
    }
  }

  if (active.length === 0 && archived.length === 0) {
    return <p className="text-muted-foreground">No trips yet. Create your first one.</p>;
  }

  return (
    <>
      <ul className="space-y-2">
        {active.map((t) => (
          <TripRow
            key={t.id}
            trip={t}
            busy={busyId === t.id}
            onArchive={() => setArchived(t.id, true)}
            onRemove={() => setRemoving(t)}
          />
        ))}
      </ul>

      {archived.length > 0 && (
        <div className="mt-6">
          <button
            type="button"
            className="text-sm text-muted-foreground hover:text-foreground"
            onClick={() => setShowArchived((v) => !v)}
            aria-expanded={showArchived}
          >
            {showArchived ? "▾" : "▸"} Show archived ({archived.length})
          </button>
          {showArchived && (
            <ul className="mt-2 space-y-2">
              {archived.map((t) => (
                <TripRow
                  key={t.id}
                  trip={t}
                  archived
                  busy={busyId === t.id}
                  onRestore={() => setArchived(t.id, false)}
                  onRemove={() => setRemoving(t)}
                />
              ))}
            </ul>
          )}
        </div>
      )}

      {removing && (
        <ConfirmDialog
          title="Remove trip?"
          message={
            <>
              <strong>{removing.title}</strong> and everything in it (days, places,
              route) will be permanently deleted. This cannot be undone.
            </>
          }
          confirmLabel="Remove"
          pending={busyId === removing.id}
          onConfirm={confirmRemove}
          onClose={() => setRemoving(null)}
        />
      )}
    </>
  );
}

function TripRow({
  trip,
  archived = false,
  busy,
  onArchive,
  onRestore,
  onRemove,
}: {
  trip: TripListItem;
  archived?: boolean;
  busy: boolean;
  onArchive?: () => void;
  onRestore?: () => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <li className={`relative ${archived ? "opacity-60" : ""}`}>
      <Link
        href={`/trips/${trip.id}`}
        className="block rounded-md border p-4 pr-12 hover:bg-accent"
      >
        <div className="font-medium">{trip.title}</div>
        <div className="text-sm text-muted-foreground">{subtitle(trip)}</div>
      </Link>
      <div className="absolute right-2 top-2">
        <button
          type="button"
          aria-label="Trip actions"
          disabled={busy}
          className="rounded px-2 py-1 text-muted-foreground hover:bg-muted disabled:opacity-50"
          onClick={() => setOpen((v) => !v)}
        >
          ⋮
        </button>
        {open && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <div className="absolute right-0 z-20 mt-1 w-32 rounded-md border bg-background py-1 shadow-md">
              {archived ? (
                <MenuItem
                  label="Restore"
                  onClick={() => {
                    setOpen(false);
                    onRestore?.();
                  }}
                />
              ) : (
                <MenuItem
                  label="Archive"
                  onClick={() => {
                    setOpen(false);
                    onArchive?.();
                  }}
                />
              )}
              <MenuItem
                label="Remove"
                destructive
                onClick={() => {
                  setOpen(false);
                  onRemove();
                }}
              />
            </div>
          </>
        )}
      </div>
    </li>
  );
}

function MenuItem({
  label,
  destructive = false,
  onClick,
}: {
  label: string;
  destructive?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`block w-full px-3 py-1.5 text-left text-sm hover:bg-accent ${
        destructive ? "text-red-600" : ""
      }`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
```

- [ ] **Step 2: Wire `app/page.tsx` to map trips into the client component**

Replace the entire contents of `app/page.tsx` with:

```tsx
import Link from "next/link";
import { prisma } from "@/lib/db";
import { listTrips } from "@/lib/trips/service";
import { Button } from "@/components/ui/button";
import { TripsList, type TripListItem } from "@/components/trips-list";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const trips = await listTrips(prisma);
  const items: TripListItem[] = trips.map((t) => ({
    id: t.id,
    title: t.title,
    startName: t.startName,
    endName: t.endName,
    isRoundTrip: t.isRoundTrip,
    archivedAt: t.archivedAt ? t.archivedAt.toISOString() : null,
  }));

  return (
    <main className="mx-auto max-w-3xl p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Your road trips</h1>
        <Button asChild>
          <Link href="/trips/new">New trip</Link>
        </Button>
      </div>

      <TripsList trips={items} />
    </main>
  );
}
```

- [ ] **Step 3: Verify it builds**

Run: `bun run build 2>&1 | tail -5`
Expected: "✓ Compiled successfully" with no type errors.

- [ ] **Step 4: Commit**

```bash
git add components/trips-list.tsx app/page.tsx
git commit -m "feat(trips): list archive toggle + per-row archive/restore/remove"
```

---

## Task 5: Trip detail header — badge + Archive/Restore/Remove

**Files:**
- Modify: `hooks/use-trip-mutations.ts` (add `useArchiveTrip`)
- Modify: `components/planner-shell.tsx` (header actions)

- [ ] **Step 1: Add the `useArchiveTrip` hook**

In `hooks/use-trip-mutations.ts`, update the top import from `@/lib/api/trips` to also import `archiveTripRequest`, then add the hook. The import line becomes:

```ts
import { setTripBaseRequest, setTripTitleRequest, archiveTripRequest, type TripBasePatch } from "@/lib/api/trips";
```

Append this hook at the end of the file:

```ts
export function useArchiveTrip(tripId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (archived: boolean) => archiveTripRequest(tripId, archived),
    onSuccess: () => qc.invalidateQueries({ queryKey: tripQueryKey(tripId) }),
  });
}
```

- [ ] **Step 2: Add imports to `planner-shell.tsx`**

In `components/planner-shell.tsx`:

- Add `useRouter` to the `next/navigation` imports. There is no existing `next/navigation` import, so add a new line near the other imports (e.g. after `import Link from "next/link";`):
  ```ts
  import { useRouter } from "next/navigation";
  ```
- Add `useArchiveTrip` to the existing `use-trip-mutations` import. The line currently reads:
  ```ts
  import { useUpdateTripBase, useSetTripTitle } from "@/hooks/use-trip-mutations";
  ```
  Change it to:
  ```ts
  import { useUpdateTripBase, useSetTripTitle, useArchiveTrip } from "@/hooks/use-trip-mutations";
  ```
- Add these imports (place near the other component imports):
  ```ts
  import { ConfirmDialog } from "@/components/confirm-dialog";
  import { deleteTripRequest } from "@/lib/api/trips";
  ```

- [ ] **Step 3: Add hook calls and local state**

In the `PlannerShell` component body, near the existing `const setTitle = useSetTripTitle(tripId);` (line ~67), add:

```ts
  const router = useRouter();
  const archiveTrip = useArchiveTrip(tripId);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [removing, setRemoving] = useState(false);
```

(`useState` is already imported in this file.)

- [ ] **Step 4: Add the remove handler**

Add this function inside the component body (e.g. just below the state added in Step 3):

```ts
  async function removeTrip() {
    setRemoving(true);
    try {
      await deleteTripRequest(tripId);
      router.push("/");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Remove failed");
      setRemoving(false);
    }
  }
```

- [ ] **Step 5: Render the header actions**

In the `<aside>` header, immediately after the `← Trips` `</Link>` (the closing tag of the back link, around line 198), insert this block:

```tsx
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
              className="text-xs text-red-600 hover:text-red-700"
              onClick={() => setConfirmingRemove(true)}
            >
              Remove
            </button>
          </div>
```

- [ ] **Step 6: Render the confirm dialog**

Find the outermost JSX returned by `PlannerShell` for the loaded state. It is wrapped in `<MapPickProvider>` (the provider whose children include the `<div className="flex h-screen w-full">`). Add the dialog as the last child inside that provider, just before its closing tag:

```tsx
        {confirmingRemove && (
          <ConfirmDialog
            title="Remove trip?"
            message={
              <>
                <strong>{trip.title}</strong> and everything in it (days, places,
                route) will be permanently deleted. This cannot be undone.
              </>
            }
            confirmLabel="Remove"
            pending={removing}
            onConfirm={removeTrip}
            onClose={() => setConfirmingRemove(false)}
          />
        )}
```

If the loaded JSX is not wrapped in a single fragment/provider that can take an extra sibling, wrap the existing returned tree and this dialog in a `<>…</>` fragment. (Read the actual return block first; the loaded-state `return (` is around line 153.)

- [ ] **Step 7: Verify it builds**

Run: `bun run build 2>&1 | tail -5`
Expected: "✓ Compiled successfully" with no type errors.

- [ ] **Step 8: Commit**

```bash
git add hooks/use-trip-mutations.ts components/planner-shell.tsx
git commit -m "feat(trips): detail header archive/restore/remove + archived badge"
```

---

## Task 6: Verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `bun run test 2>&1 | tail -6`
Expected: all pass (161 tests).

- [ ] **Step 2: Run the production build**

Run: `bun run build 2>&1 | tail -5`
Expected: "✓ Compiled successfully", no type errors.

- [ ] **Step 3: Live smoke test**

Ensure the dev server is running (`bun run dev` if not), then in a browser (or via Playwright against `http://localhost:3000`):

1. **List archive:** On the home page, open a trip's `⋮` menu → **Archive**. The trip leaves the active list. A "Show archived (1)" toggle appears; expand it — the trip is there, dimmed.
2. **List restore:** From the archived row's `⋮` menu → **Restore**. It returns to the active list.
3. **List remove:** From a row's `⋮` menu → **Remove** → the confirm dialog names the trip. **Cancel** leaves it; **Remove** deletes it (it disappears).
4. **Detail archive:** Open a trip. In the sidebar header, click **Archive** → an "Archived" badge appears and the button becomes **Restore** (you stay on the page). Click **Restore** → badge gone.
5. **Detail remove:** Click **Remove** → confirm → you are navigated to `/` and the trip is gone from the list.
6. Confirm there are **no console errors** during the above.

- [ ] **Step 4: Final whole-branch review**

Dispatch a final code review over the whole branch diff (`git diff main...HEAD`) against the spec at `docs/superpowers/specs/2026-06-10-archive-and-remove-trips-design.md`. Apply any high-confidence fixes.

- [ ] **Step 5: Finish the branch**

Use the `superpowers:finishing-a-development-branch` skill (tests pass → present options → merge to `main` with `--no-ff` and delete the branch, per the established workflow).

---

## Notes for the implementer

- **`archivedAt` serialization:** Prisma returns `archivedAt` as a `Date`. The server component (`app/page.tsx`) converts it to an ISO string before passing to the client `TripsList`. In `TripDetail` (from the JSON API) it is already a string. Keep the client-facing type as `string | null`.
- **No HTTP route-handler tests** exist in this project; the API behavior is covered by the schema test (validation) + service test (the `archived`/cascade logic) + the live smoke test (the handler wiring). Do not add a route-handler test harness — it's outside the established pattern.
- **Why `router.refresh()` on the list but query invalidation on detail:** the list page is a server component with no TanStack query to invalidate; `router.refresh()` re-runs the server fetch. The detail page is TanStack-backed, so invalidating `tripQueryKey(tripId)` updates it in place.
