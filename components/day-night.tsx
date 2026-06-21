"use client";

import { useEffect, useState } from "react";
import { PlaceAutocomplete } from "@/components/place-autocomplete";
import { NightEditor } from "@/components/night-editor";
import { useSetNight, useClearNight } from "@/hooks/use-night-mutations";
import { usePlannerRole } from "@/components/planner-role";
import { formatNightStay } from "@/lib/itinerary/night-label";
import type { DayNight as DayNightData } from "@/lib/api/trips";

export function DayNight({
  tripId,
  dayId,
  night,
  dateLabel,
  checkoutLabel,
  onFocusPlace,
}: {
  tripId: string;
  dayId: string;
  night: DayNightData | null;
  /** Formatted date of the day this night belongs to (check-in). */
  dateLabel?: string | null;
  /** Formatted date of the morning after (check-out). */
  checkoutLabel?: string | null;
  onFocusPlace?: (lat: number, lng: number) => void;
}) {
  const setNight = useSetNight(tripId);
  const clearNight = useClearNight(tripId);
  const { canEdit } = usePlannerRole();
  const [editing, setEditing] = useState(false);

  // If the night is cleared or replaced (different id) while `editing` was left
  // on, don't auto-open the editor for the new/absent night.
  const nightId = night?.id;
  useEffect(() => {
    setEditing(false);
  }, [nightId]);

  if (!night) {
    if (!canEdit) return null;
    return (
      <PlaceAutocomplete
        placeholder="🛏️ Where will you sleep? (search address)"
        className="mt-1"
        pickId={`night-set:${dayId}`}
        onPick={(p) =>
          setNight.mutate({ dayId, lat: p.lat, lng: p.lng, title: p.name })
        }
      />
    );
  }

  // One night, read as a span: "1 night · 13 Jun → 14 Jun".
  const stay = formatNightStay([0], dateLabel ?? null, checkoutLabel ?? null);
  return (
    <div className="mt-1 flex items-center gap-2 rounded-md border bg-muted/30 px-2 py-1.5 text-xs">
      <span
        className="flex min-w-0 flex-1 cursor-pointer flex-col text-left"
        title={`${stay} · click to show on map`}
        onClick={() => onFocusPlace?.(night.lat, night.lng)}
      >
        <span className="truncate">🛏️ {night.title || "Night stop"}</span>
        <span className="truncate text-[11px] text-muted-foreground">{stay}</span>
      </span>
      {canEdit ? (
        <button
          type="button"
          className="shrink-0 text-muted-foreground hover:text-foreground"
          aria-label="Edit night stop"
          onClick={() => setEditing(true)}
        >
          ✎
        </button>
      ) : null}
      {canEdit ? (
        <button
          type="button"
          className="shrink-0 text-muted-foreground hover:text-red-600 disabled:opacity-50"
          aria-label="Remove night"
          disabled={clearNight.isPending}
          onClick={() => clearNight.mutate(dayId)}
        >
          ✕
        </button>
      ) : null}
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
