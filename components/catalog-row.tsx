"use client";

import { useSortable } from "@dnd-kit/react/sortable";
import { useRemovePoi, useMovePoi } from "@/hooks/use-poi-mutations";
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
      <span className="flex-1 truncate">{poi.name}</span>
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
    </li>
  );
}
