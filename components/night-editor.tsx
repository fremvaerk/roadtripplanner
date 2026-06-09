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
  // Unique element-id prefix so label/aria associations never collide if two
  // editors are ever mounted at once.
  const uid = `ne-${dayId}`;

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
