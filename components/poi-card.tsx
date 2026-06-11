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
  legBelow,
}: {
  poi: PoiDetail;
  index: number;
  group: string;
  tripId: string;
  legBelow?: string | null;
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
    <li ref={ref} className={isDragging ? "opacity-50" : ""}>
      <div className="flex items-start gap-3 rounded-md border bg-background p-2 text-sm">
        <span
          ref={handleRef}
          aria-label="Drag to reorder"
          className="mt-1 cursor-grab select-none px-1 text-muted-foreground"
        >
          ⠿
        </span>
        {poi.imageUrl && poi.imageUrl !== brokenUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={poi.imageUrl}
            alt=""
            onError={() => setBrokenUrl(poi.imageUrl)}
            className="h-14 w-14 shrink-0 rounded object-cover"
          />
        ) : (
          <div
            aria-hidden="true"
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded bg-muted text-muted-foreground"
          >
            📍
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{poi.name}</p>
          {poi.category ? (
            <p className="truncate text-xs text-muted-foreground">
              {poi.category}
            </p>
          ) : null}
          {poi.description ? (
            <p className="line-clamp-2 text-xs text-muted-foreground">
              {poi.description}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-start">
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
            onClick={() =>
              movePoi.mutate({ poiId: poi.id, dayId: null, orderInDay: 0 })
            }
          >
            ✕
          </Button>
        </div>
        {editing ? (
          <PlaceEditor
            poi={poi}
            tripId={tripId}
            onClose={() => setEditing(false)}
          />
        ) : null}
      </div>
      {legBelow ? (
        <div
          aria-hidden="true"
          className="flex items-center gap-1.5 pl-7 pt-1 text-xs text-muted-foreground"
        >
          <span className="text-muted-foreground/40">│</span>
          <span>🚗 {legBelow}</span>
        </div>
      ) : null}
    </li>
  );
}
