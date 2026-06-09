"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PlaceAutocomplete } from "@/components/place-autocomplete";
import { useSetNight, useUpdateNight, useClearNight } from "@/hooks/use-night-mutations";
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
  const updateNight = useUpdateNight(tripId);
  const clearNight = useClearNight(tripId);

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
    <NightEditor
      key={night.id}
      dayId={dayId}
      night={night}
      onClear={() => clearNight.mutate(dayId)}
      updateNight={updateNight}
    />
  );
}

function NightEditor({
  dayId,
  night,
  onClear,
  updateNight,
}: {
  dayId: string;
  night: DayNightData;
  onClear: () => void;
  updateNight: ReturnType<typeof useUpdateNight>;
}) {
  const [title, setTitle] = useState(night.title ?? "");
  const [url, setUrl] = useState(night.url ?? "");
  const [notes, setNotes] = useState(night.notes ?? "");

  return (
    <div className="mt-1 rounded-md border bg-muted/30 p-2 text-xs">
      <div className="mb-1 flex items-center justify-between">
        <span className="font-medium">🛏️ Night</span>
        <button type="button" className="text-muted-foreground hover:text-red-600" aria-label="Remove night" onClick={onClear}>
          ✕
        </button>
      </div>
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => updateNight.mutate({ dayId, title: title.trim() || null })}
        placeholder="Title (e.g. Parking near forest)"
        className="mb-1 h-7 text-xs"
      />
      <Input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onBlur={() => updateNight.mutate({ dayId, url: url.trim() || null })}
        placeholder="Link (Airbnb / Booking / campsite)"
        className="mb-1 h-7 text-xs"
      />
      {url.trim() ? (
        <a href={url.trim()} target="_blank" rel="noreferrer" className="mb-1 block truncate text-blue-600 underline">
          {url.trim()}
        </a>
      ) : null}
      <Textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={() => updateNight.mutate({ dayId, notes: notes.trim() || null })}
        placeholder="Notes"
        rows={2}
        className="text-xs"
      />
      <PlaceAutocomplete
        placeholder="📍 Change location…"
        className="mt-1"
        pickId={`night-move:${dayId}`}
        onPick={(p) => updateNight.mutate({ dayId, lat: p.lat, lng: p.lng })}
      />
    </div>
  );
}
