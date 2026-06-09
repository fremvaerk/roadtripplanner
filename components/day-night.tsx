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
        className="shrink-0 text-muted-foreground hover:text-foreground"
        aria-label="Edit night stop"
        onClick={() => setEditing(true)}
      >
        ✎
      </button>
      <button
        type="button"
        className="shrink-0 text-muted-foreground hover:text-red-600"
        aria-label="Remove night"
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
