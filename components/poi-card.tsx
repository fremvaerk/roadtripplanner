"use client";

import { useSortable } from "@dnd-kit/react/sortable";
import { Button } from "@/components/ui/button";
import { useRemovePoi, useSetOvernight } from "@/hooks/use-poi-mutations";
import type { PoiDetail } from "@/lib/api/trips";

export function PoiCard({
  poi,
  index,
  group,
  tripId,
}: {
  poi: PoiDetail;
  index: number;
  group: string;
  tripId: string;
}) {
  const { ref, handleRef, isDragging } = useSortable({
    id: poi.id,
    index,
    group,
    type: "poi",
    accept: "poi",
  });
  const removePoi = useRemovePoi(tripId);
  const setOvernight = useSetOvernight(tripId);
  const inDay = group !== "pool";

  return (
    <li
      ref={ref}
      className={`flex items-center gap-2 rounded-md border bg-background px-2 py-2 text-sm ${
        isDragging ? "opacity-50" : ""
      }`}
    >
      <span
        ref={handleRef}
        aria-label="Drag to reorder"
        className="cursor-grab select-none px-1 text-muted-foreground"
      >
        ⠿
      </span>
      <span className="flex-1 truncate">
        {poi.isOvernight ? "🌙 " : ""}
        {poi.name}
      </span>
      {inDay && (
        <Button
          variant="ghost"
          size="sm"
          aria-label={poi.isOvernight ? `Unset overnight for ${poi.name}` : `Set ${poi.name} as overnight`}
          onClick={() => setOvernight.mutate({ poiId: poi.id, isOvernight: !poi.isOvernight })}
        >
          🌙
        </Button>
      )}
      <Button
        variant="ghost"
        size="sm"
        aria-label={`Remove ${poi.name}`}
        onClick={() => removePoi.mutate(poi.id)}
      >
        ✕
      </Button>
    </li>
  );
}
