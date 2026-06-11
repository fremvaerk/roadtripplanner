# Night Editor Popup + Pick-on-Map Button — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Arm map-picking via an explicit 📍 button on every location field (typing just searches), and edit a night stop in a popup that hides itself while you pick its location on the map.

**Architecture:** `PlaceAutocomplete` gains a 📍 button that toggles the existing MapPick arming (replacing focus-to-arm). The night editor becomes a compact chip + a centered modal (`NightEditor`) that toggles to `display:none` (staying mounted) while its location field is armed, so the map is clickable and the armed field isn't unmounted.

**Tech Stack:** Next.js 16 / React 19, TypeScript, `@vis.gl/react-google-maps`, TanStack Query, Bun. No backend changes.

---

## File Structure

- **Modify** `components/place-autocomplete.tsx` — arm via a 📍 button (not focus).
- **Create** `components/night-editor.tsx` — the night popup (fields + Save + hide-while-armed + banner).
- **Modify** `components/day-night.tsx` — compact chip + ✎/✕ for a set night; open the popup; keep the inline create field.

No unit tests (UI + Google SDK); each task verifies with `bun run build`, validated by the live smoke test in Task 4.

---

### Task 1: Arm via a 📍 button in `PlaceAutocomplete`

**Files:**
- Modify: `components/place-autocomplete.tsx`

- [ ] **Step 1: Remove focus-arming and add the 📍 toggle button**

In `components/place-autocomplete.tsx`, add a `toggleArm` helper just before the `return` (after the `pick` function):

```tsx
  function toggleArm() {
    if (!pickId || !mapPick) return;
    if (armed) mapPick.disarm(pickId);
    else mapPick.arm(pickId, onPick);
  }
```

Then replace the entire `return ( ... )` JSX with this version (input + 📍 button in a flex row; focus no longer arms; the armed hint text changes):

```tsx
  return (
    <div className={`relative ${className ?? ""}${armed ? " rounded-md ring-2 ring-blue-500" : ""}`}>
      <div className="flex gap-1">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape" && pickId && mapPick) {
              mapPick.disarm(pickId);
              (e.currentTarget as HTMLInputElement).blur();
            }
          }}
          placeholder={placeholder}
          aria-label={ariaLabel ?? placeholder}
          className="flex-1"
        />
        {pickId && mapPick && (
          <button
            type="button"
            onClick={toggleArm}
            aria-label="Pick on map"
            aria-pressed={armed}
            title="Pick on map"
            className={`shrink-0 rounded-md border px-2 text-sm ${
              armed ? "border-blue-400 bg-blue-100 text-blue-700" : "text-muted-foreground hover:bg-accent"
            }`}
          >
            📍
          </button>
        )}
      </div>
      {armed && predictions.length === 0 && (
        <p className="mt-1 text-xs text-blue-600">Click the map to set this location · Esc to cancel.</p>
      )}
      {predictions.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded-md border bg-background shadow">
          {predictions.map((p) => (
            <li key={p.placeId}>
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm hover:bg-accent"
                onClick={() => pick(p)}
              >
                <span className="font-medium">{p.mainText?.text ?? p.text?.text}</span>
                {p.secondaryText?.text && (
                  <span className="block text-xs text-muted-foreground">
                    {p.secondaryText.text}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
```

(Note: the old `<Input>` had an `onFocus` that armed — it is intentionally gone. The `armed` flag, `disarm`-on-unmount effect, `disarm`-after-pick, and the ring all stay as they are.)

- [ ] **Step 2: Build**

Run: `bun run build`
Expected: succeeds. All existing usages keep working — those with a `pickId` now show the 📍 button and arm via it; focusing no longer arms.

- [ ] **Step 3: Commit**

```bash
git add components/place-autocomplete.tsx
git -c user.name="Anatolii Lapytskyi" -c user.email="anatolii.lapytskyi@gmail.com" commit -m "feat(places): arm map-pick via an explicit 📍 button (not focus)"
```
(Project rule: no AI co-author trailer.)

---

### Task 2: The `NightEditor` popup

**Files:**
- Create: `components/night-editor.tsx`

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { PlaceAutocomplete } from "@/components/place-autocomplete";
import { useUpdateNight } from "@/hooks/use-night-mutations";
import { useMapPick } from "@/components/map-pick-context";
import type { DayNight } from "@/lib/api/trips";

export function NightEditor({
  tripId,
  dayId,
  night,
  onClose,
}: {
  tripId: string;
  dayId: string;
  night: DayNight;
  onClose: () => void;
}) {
  const updateNight = useUpdateNight(tripId);
  const mapPick = useMapPick();
  const pickId = `night-move:${dayId}`;
  const picking = mapPick?.armedId === pickId;

  const [title, setTitle] = useState(night.title ?? "");
  const [url, setUrl] = useState(night.url ?? "");
  const [notes, setNotes] = useState(night.notes ?? "");
  const [lat, setLat] = useState(night.lat);
  const [lng, setLng] = useState(night.lng);
  const [locLabel, setLocLabel] = useState(`${night.lat.toFixed(4)}, ${night.lng.toFixed(4)}`);

  // Escape closes the popup — but NOT while picking (then Escape is the map-pick
  // context's cancel, which clears `armedId` and un-hides this popup).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !picking) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, picking]);

  function save() {
    updateNight.mutate(
      {
        dayId,
        title: title.trim() || null,
        url: url.trim() || null,
        notes: notes.trim() || null,
        lat,
        lng,
      },
      { onSuccess: () => onClose() },
    );
  }

  const link = url.trim();

  return (
    <>
      {picking && (
        <div className="fixed left-1/2 top-3 z-50 -translate-x-1/2 rounded-md border bg-background px-3 py-1.5 text-xs shadow-md">
          Click the map to place the night · Esc to cancel
        </div>
      )}
      {/* While picking, hide via display:none (do NOT unmount) so the armed
          PlaceAutocomplete inside stays mounted and the map is clickable. */}
      <div
        className={`fixed inset-0 z-40 items-center justify-center bg-black/40 ${picking ? "hidden" : "flex"}`}
        onClick={onClose}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="ne-title"
          className="w-80 max-w-[90vw] rounded-md border bg-background p-4 shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          <h3 id="ne-title" className="mb-2 text-sm font-semibold">Edit night stop</h3>
          <div className="space-y-2">
            <div>
              <Label htmlFor="ne-name" className="text-xs">Title</Label>
              <Input
                id="ne-name"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Parking near forest"
                className="h-8 text-sm"
              />
            </div>
            <div>
              <Label htmlFor="ne-url" className="text-xs">Link</Label>
              <Input
                id="ne-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="Airbnb / Booking / campsite"
                className="h-8 text-sm"
              />
              {link ? (
                <a href={link} target="_blank" rel="noreferrer" className="mt-1 block truncate text-xs text-blue-600 underline">
                  {link}
                </a>
              ) : null}
            </div>
            <div>
              <Label htmlFor="ne-notes" className="text-xs">Notes</Label>
              <Textarea id="ne-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="text-sm" />
            </div>
            <div>
              <Label className="text-xs">Location</Label>
              <div className="mb-1 text-xs text-muted-foreground">📍 {locLabel}</div>
              <PlaceAutocomplete
                placeholder="Change location…"
                pickId={pickId}
                onPick={(p) => {
                  setLat(p.lat);
                  setLng(p.lng);
                  setLocLabel(p.name);
                }}
              />
            </div>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" onClick={save} disabled={updateNight.isPending}>Save</Button>
          </div>
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Build**

Run: `bun run build`
Expected: succeeds (component exported, not yet used). Confirm `DayNight` type is exported from `@/lib/api/trips` (it is) and `useUpdateNight` from `@/hooks/use-night-mutations` (it is).

- [ ] **Step 3: Commit**

```bash
git add components/night-editor.tsx
git -c user.name="Anatolii Lapytskyi" -c user.email="anatolii.lapytskyi@gmail.com" commit -m "feat(night): NightEditor popup that hides while picking a location on the map"
```

---

### Task 3: Day-card chip that opens the popup (`components/day-night.tsx`)

**Files:**
- Modify: `components/day-night.tsx`

- [ ] **Step 1: Replace the inline editor with a chip + popup**

Replace the ENTIRE contents of `components/day-night.tsx` with:

```tsx
"use client";

import { useState } from "react";
import { PlaceAutocomplete } from "@/components/place-autocomplete";
import { NightEditor } from "@/components/night-editor";
import { useSetNight, useClearNight } from "@/hooks/use-night-mutations";
import type { DayNight as DayNightData } from "@/lib/api/trips";

export function DayNight({
  tripId,
  dayId,
  night,
}: {
  tripId: string;
  dayId: string;
  night: DayNightData | null;
}) {
  const setNight = useSetNight(tripId);
  const clearNight = useClearNight(tripId);
  const [editing, setEditing] = useState(false);

  if (!night) {
    return (
      <PlaceAutocomplete
        placeholder="🛏️ Where will you sleep? (search address)"
        className="mt-1"
        pickId={`night-set:${dayId}`}
        onPick={(p) => setNight.mutate({ dayId, lat: p.lat, lng: p.lng, title: p.name })}
      />
    );
  }

  return (
    <div className="mt-1 flex items-center gap-2 rounded-md border bg-muted/30 px-2 py-1.5 text-xs">
      <span className="flex-1 truncate">🛏️ {night.title || "Night stop"}</span>
      <button
        type="button"
        aria-label="Edit night stop"
        className="px-1 text-muted-foreground hover:text-foreground"
        onClick={() => setEditing(true)}
      >
        ✎
      </button>
      <button
        type="button"
        aria-label="Remove night"
        className="px-1 text-muted-foreground hover:text-red-600"
        onClick={() => clearNight.mutate(dayId)}
      >
        ✕
      </button>
      {editing ? (
        <NightEditor
          key={night.id}
          tripId={tripId}
          dayId={dayId}
          night={night}
          onClose={() => setEditing(false)}
        />
      ) : null}
    </div>
  );
}
```

(This removes the old inline `NightEditor` function and the `useUpdateNight`/`Input`/`Textarea` imports that moved into `components/night-editor.tsx`.)

- [ ] **Step 2: Build**

Run: `bun run build`
Expected: succeeds; no leftover references to the removed inline editor.

- [ ] **Step 3: Commit**

```bash
git add components/day-night.tsx
git -c user.name="Anatolii Lapytskyi" -c user.email="anatolii.lapytskyi@gmail.com" commit -m "feat(night): compact night chip with edit popup; keep inline create field"
```

---

### Task 4: Verification

**Files:** none (validation only)

- [ ] **Step 1: Full test suite**

Run: `bun run test`
Expected: all existing tests pass (no new ones; nothing broken).

- [ ] **Step 2: Production build**

Run: `bun run build`
Expected: succeeds.

- [ ] **Step 3: Live smoke test**

Start `bun run dev`, open a trip. Verify:
1. Each location field shows a **📍 button**. Typing in "Change start" searches (no crosshair). Clicking 📍 → crosshair on map → click the map → the field fills and disarms.
2. A day with no night shows the inline "🛏️ Where will you sleep?" (with a 📍 button) — creating a night via search or pick-on-map still works.
3. A set night shows a **compact chip** (`🛏️ <title or "Night stop">`) with **✎** and **✕**. ✕ removes it.
4. Click **✎** → the popup opens with Title / Link (live preview) / Notes / Location.
5. In the popup, click the location field's **📍** → the popup **hides**, a banner shows ("Click the map to place the night · Esc to cancel"), the map shows a crosshair → click the map → the popup **reappears** with the new "📍 <address>" → **Save** persists location + fields.
6. **Esc** while picking → popup returns unchanged. **Esc**/Cancel/backdrop (when not picking) → closes without saving. Address search in the popup and dragging the 🛏️ marker also relocate. No console errors.

- [ ] **Step 4: Final review + merge**

Dispatch a final code review over the branch diff, fix anything above threshold, then merge to `main` per superpowers:finishing-a-development-branch.

---

## Notes for the implementer

- **The hide-while-armed MUST use `display:none` (`hidden`), not conditional unmount.** If the modal subtree unmounts while armed, the `PlaceAutocomplete`'s disarm-on-unmount effect fires and cancels the pick before the map click lands.
- **The picking banner is a sibling of the hidden modal**, so it stays visible while the modal is `display:none`.
- **Location commits on Save** (the popup holds `lat`/`lng` locally; the "Change location" `onPick` — from search or map — only updates local state), consistent with `PlaceEditor`.
- Night **create** stays inline (so pick-on-map works without a modal); only **editing** an existing night uses the popup.
</content>
