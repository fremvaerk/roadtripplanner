"use client";

import { useState, useEffect } from "react";
import { useSortable } from "@dnd-kit/react/sortable";
import { Button } from "@/components/ui/button";
import { PlaceEditor } from "@/components/place-editor";
import { useMovePoi } from "@/hooks/use-poi-mutations";
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
  const movePoi = useMovePoi(tripId);
  const [editing, setEditing] = useState(false);
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null);
  useEffect(() => {
    setBrokenUrl(null);
  }, [poi.imageUrl]);

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
      <Button
        variant="ghost"
        size="sm"
        aria-label={`Remove ${poi.name} from this day`}
        onClick={() => movePoi.mutate({ poiId: poi.id, dayId: null, orderInDay: 0 })}
      >
        ✕
      </Button>
      {editing ? <PlaceEditor poi={poi} tripId={tripId} onClose={() => setEditing(false)} /> : null}
    </li>
  );
}
