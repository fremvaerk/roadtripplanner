# Edit a Place From a Day Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an ✎ Edit button to each place card inside a day so the place opens in the existing `PlaceEditor` modal.

**Architecture:** Mirror the master-list `CatalogRow`: a local `editing` state on `PoiCard` that renders `<PlaceEditor>`. No new edit logic or backend change.

**Tech Stack:** Next.js 16, React 19, TypeScript, Bun. UI only — verified via `bun run build` + live smoke.

---

## Reference

- `components/poi-card.tsx` renders a day-assigned place: drag handle (⠿), name, and a ✕ `<Button>` that removes it from the day (`useMovePoi` → `dayId: null`).
- `PlaceEditor` (`components/place-editor.tsx`) — props `{ poi: PoiDetail, tripId: string, onClose: () => void }`, a fixed-overlay modal saving via `useUpdatePoi`.
- `CatalogRow` already does this: `const [editing, setEditing] = useState(false)`, a ✎ `<button>` (`onClick={() => setEditing(true)}`), and `{editing ? <PlaceEditor poi={poi} tripId={tripId} onClose={() => setEditing(false)} /> : null}` at the end of its `<li>`.

---

## Task 1: ✎ Edit on `PoiCard`

**Files:**
- Modify: `components/poi-card.tsx`

- [ ] **Step 1: Imports + state**

In `components/poi-card.tsx`, change the React import and add the `PlaceEditor` import:
```ts
import { useState } from "react";
```
(add at the top with the other imports), and:
```ts
import { PlaceEditor } from "@/components/place-editor";
```

In the `PoiCard` function body, after `const movePoi = useMovePoi(tripId);`, add:
```ts
  const [editing, setEditing] = useState(false);
```

- [ ] **Step 2: Add the ✎ button before the ✕**

In the returned `<li>`, immediately **before** the existing `<Button … >✕</Button>` (the "Remove … from this day" button), insert:
```tsx
      <button
        type="button"
        aria-label={`Edit ${poi.name}`}
        className="px-1 text-muted-foreground hover:text-foreground"
        onClick={() => setEditing(true)}
      >
        ✎
      </button>
```

- [ ] **Step 3: Render the editor**

Immediately **before** the closing `</li>`, add:
```tsx
      {editing ? <PlaceEditor poi={poi} tripId={tripId} onClose={() => setEditing(false)} /> : null}
```

- [ ] **Step 4: Build + tests**

Run: `bun run build 2>&1 | tail -5` → "✓ Compiled successfully", no type errors.
Run: `bun run test 2>&1 | tail -3` → all pass (166).

- [ ] **Step 5: Commit**

```bash
git add components/poi-card.tsx
git commit -m "feat(itinerary): edit a place from its day card (✎ → PlaceEditor)"
```

---

## Task 2: Verification

**Files:** none.

- [ ] **Step 1: Build + tests**

Run: `bun run build 2>&1 | tail -5` → "✓ Compiled successfully".
Run: `bun run test 2>&1 | tail -3` → all pass.

- [ ] **Step 2: Live smoke (the Nordkapp trip)**

Restart the dev server if needed, open the Nordkapp trip:
1. Expand the **Days** section; in a day with assigned places, click **✎** on a place → `PlaceEditor` opens for that place.
2. Change a field (e.g. description or name) → Save → it persists; if the name changed it updates in the day card and in the **Places** master-list entry for the same place.
3. The ✕ still removes the place from the day; no console errors.

- [ ] **Step 3: Final review + finish**

Dispatch a final review over `git diff main...HEAD` against the spec. Apply high-confidence fixes, then use `superpowers:finishing-a-development-branch` to merge to `main` (`--no-ff`, delete branch).

---

## Notes for the implementer

- `PoiCard` keeps its own `editing` state (the `CatalogRow` pattern) — do not thread a callback through the planner tree.
- `PlaceEditor` is a fixed-overlay modal, so it renders correctly from inside the day card / sortable `<li>`.
- The ✕ (remove from day) is unchanged; ✎ is purely additive.
