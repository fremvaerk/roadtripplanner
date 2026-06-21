"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { PlaceAutocomplete } from "@/components/place-autocomplete";
import { useUpdateNight, useSetNight } from "@/hooks/use-night-mutations";
import { useMapPick } from "@/components/map-pick-context";
import { useTrip } from "@/hooks/use-trip";
import { followingDayIds, followingDayCount } from "@/lib/itinerary/night-repeat";
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
  const setNight = useSetNight(tripId);
  const { data: trip } = useTrip(tripId);
  const days = trip?.days ?? [];
  const maxRepeat = followingDayCount(days, dayId);
  const mapPick = useMapPick();
  const pickId = `night-move:${dayId}`;
  const picking = mapPick?.armedId === pickId;
  // Unique element-id prefix so label/aria associations never collide if two
  // editors are ever mounted at once.
  const uid = `ne-${dayId}`;

  const [title, setTitle] = useState(night.title ?? "");
  const [url, setUrl] = useState(night.url ?? "");
  const [notes, setNotes] = useState(night.notes ?? "");
  const [lat, setLat] = useState(night.lat);
  const [lng, setLng] = useState(night.lng);
  const [locLabel, setLocLabel] = useState(
    night.title ?? `${night.lat.toFixed(4)}, ${night.lng.toFixed(4)}`,
  );
  // "Repeat this night for the next N days" — applies the same location/details
  // to consecutive days, which collapse into one multi-night marker on the map.
  const [repeat, setRepeat] = useState(0);
  const clampedRepeat = Math.max(0, Math.min(repeat, maxRepeat));

  // Escape closes the popup — but NOT while picking (then Escape is the map-pick
  // context's cancel, which clears `armedId` and un-hides this popup).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !picking) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, picking]);

  // Defensive: if the popup unmounts while its location field is still armed,
  // clear the armed state so the map doesn't stay in pick mode.
  useEffect(() => {
    return () => {
      mapPick?.disarm(pickId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save() {
    const payload = {
      title: title.trim() || null,
      url: url.trim() || null,
      notes: notes.trim() || null,
      lat,
      lng,
    };
    await updateNight.mutateAsync({ dayId, ...payload });
    if (clampedRepeat > 0) {
      // Upsert the same night onto the next N days so they group into one stay.
      const targets = followingDayIds(days, dayId, clampedRepeat);
      await Promise.all(targets.map((id) => setNight.mutateAsync({ dayId: id, ...payload })));
    }
    onClose();
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
          aria-labelledby={`${uid}-title`}
          className="w-80 max-w-[90vw] rounded-md border bg-background p-4 shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          <h3 id={`${uid}-title`} className="mb-2 text-sm font-semibold">Edit night stop</h3>
          <div className="space-y-2">
            <div>
              <Label htmlFor={`${uid}-name`} className="text-xs">Title</Label>
              <Input
                id={`${uid}-name`}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Parking near forest"
                className="h-8 text-sm"
              />
            </div>
            <div>
              <Label htmlFor={`${uid}-url`} className="text-xs">Link</Label>
              <Input
                id={`${uid}-url`}
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
              <Label htmlFor={`${uid}-notes`} className="text-xs">Notes</Label>
              <Textarea id={`${uid}-notes`} value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="text-sm" />
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
            {maxRepeat > 0 ? (
              <div>
                <Label htmlFor={`${uid}-repeat`} className="text-xs">
                  Repeat for the next nights
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    id={`${uid}-repeat`}
                    type="number"
                    min={0}
                    max={maxRepeat}
                    value={clampedRepeat}
                    onChange={(e) => setRepeat(Number(e.target.value) || 0)}
                    className="h-8 w-16 text-sm"
                  />
                  <span className="text-xs text-muted-foreground">
                    {clampedRepeat > 0
                      ? `also sets the next ${clampedRepeat} night${clampedRepeat > 1 ? "s" : ""} to this place`
                      : `up to ${maxRepeat} more (same hotel for several nights)`}
                  </span>
                </div>
              </div>
            ) : null}
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" onClick={save} disabled={updateNight.isPending || setNight.isPending}>Save</Button>
          </div>
        </div>
      </div>
    </>
  );
}
