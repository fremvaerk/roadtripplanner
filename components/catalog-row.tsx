"use client";

import { useEffect, useState } from "react";
import { useSortable } from "@dnd-kit/react/sortable";
import { useRemovePoi, useMovePoi } from "@/hooks/use-poi-mutations";
import { PlaceEditor } from "@/components/place-editor";
import type { PoiDetail, DayDetail } from "@/lib/api/trips";

export function CatalogRow({
  poi,
  index,
  group,
  tripId,
  days,
}: {
  poi: PoiDetail;
  index: number;
  group: string;
  tripId: string;
  days: DayDetail[];
}) {
  const { ref, handleRef, isDragging } = useSortable({
    id: poi.id,
    index,
    group,
    type: "poi",
    accept: "poi",
  });
  const removePoi = useRemovePoi(tripId);
  const movePoi = useMovePoi(tripId);
  const [editing, setEditing] = useState(false);
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null);

  useEffect(() => {
    setBrokenUrl(null);
  }, [poi.imageUrl]);

  function onAssign(value: string) {
    if (value === "") {
      movePoi.mutate({ poiId: poi.id, dayId: null, orderInDay: 0 });
    } else {
      movePoi.mutate({ poiId: poi.id, dayId: value, orderInDay: 9999 });
    }
  }

  return (
    <li
      ref={ref}
      className={`flex items-center gap-2 rounded-md border bg-background px-2 py-1.5 text-sm ${
        isDragging ? "opacity-50" : ""
      }`}
    >
      <span ref={handleRef} aria-label="Drag to a group" className="cursor-grab select-none px-1 text-muted-foreground">
        ⠿
      </span>
      {poi.imageUrl && poi.imageUrl !== brokenUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={poi.imageUrl}
          alt=""
          onError={() => setBrokenUrl(poi.imageUrl)}
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
      <select
        aria-label={`Assign ${poi.name} to a day`}
        className="rounded border bg-background px-1 py-0.5 text-xs"
        value={poi.dayId ?? ""}
        onChange={(e) => onAssign(e.target.value)}
      >
        <option value="">—</option>
        {days.map((d) => (
          <option key={d.id} value={d.id}>
            Day {d.dayIndex + 1}
          </option>
        ))}
      </select>
      <button
        type="button"
        aria-label={`Delete ${poi.name}`}
        className="px-1 text-muted-foreground hover:text-red-600"
        onClick={() => removePoi.mutate(poi.id)}
      >
        ✕
      </button>
      {editing ? <PlaceEditor poi={poi} tripId={tripId} onClose={() => setEditing(false)} /> : null}
    </li>
  );
}
