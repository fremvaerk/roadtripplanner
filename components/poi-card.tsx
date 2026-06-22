"use client";

import { useState, useEffect } from "react";
import { useSortable } from "@dnd-kit/react/sortable";
import { PlaceEditor } from "@/components/place-editor";
import { useMovePoi } from "@/hooks/use-poi-mutations";
import { usePlannerRole } from "@/components/planner-role";
import type { PoiDetail } from "@/lib/api/trips";

export function PoiCard({
  poi,
  index,
  group,
  tripId,
  legBelow,
  onFocusPlace,
}: {
  poi: PoiDetail;
  index: number;
  group: string;
  tripId: string;
  legBelow?: string | null;
  onFocusPlace?: (lat: number, lng: number) => void;
}) {
  const { ref, handleRef, isDragging } = useSortable({
    id: poi.id,
    index,
    group,
    type: "poi",
    accept: "poi",
  });
  const movePoi = useMovePoi(tripId);
  const { canEdit } = usePlannerRole();
  const [editing, setEditing] = useState(false);
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null);
  useEffect(() => {
    setBrokenUrl(null);
  }, [poi.imageUrl]);

  return (
    <li ref={ref} className={isDragging ? "opacity-50" : ""}>
      <div className="group/card flex items-start gap-2.5 rounded-lg border bg-card p-2 text-sm shadow-xs transition-colors hover:border-foreground/15">
        {canEdit ? (
          <span
            ref={handleRef}
            aria-label="Drag to reorder"
            className="mt-0.5 cursor-grab select-none text-base leading-none text-muted-foreground/50 transition-colors hover:text-muted-foreground"
          >
            ⠿
          </span>
        ) : null}
        {poi.imageUrl && poi.imageUrl !== brokenUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={poi.imageUrl}
            alt=""
            onError={() => setBrokenUrl(poi.imageUrl)}
            onClick={() => onFocusPlace?.(poi.lat, poi.lng)}
            className="h-16 w-16 shrink-0 cursor-pointer rounded-md object-cover"
          />
        ) : (
          <div
            aria-hidden="true"
            onClick={() => onFocusPlace?.(poi.lat, poi.lng)}
            className="flex h-16 w-16 shrink-0 cursor-pointer items-center justify-center rounded-md bg-muted text-lg text-muted-foreground"
          >
            📍
          </div>
        )}
        <div
          className="min-w-0 flex-1 cursor-pointer"
          title="Show on map"
          onClick={() => onFocusPlace?.(poi.lat, poi.lng)}
        >
          <p className="line-clamp-2 font-medium leading-snug">{poi.name}</p>
          {poi.category ? (
            <p className="truncate text-xs text-muted-foreground">
              {poi.category}
            </p>
          ) : null}
          {poi.description ? (
            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
              {poi.description}
            </p>
          ) : null}
        </div>
        {canEdit ? (
          <div className="-mr-0.5 flex shrink-0 items-start text-muted-foreground opacity-60 transition-opacity group-hover/card:opacity-100">
            <button
              type="button"
              aria-label={`Edit ${poi.name}`}
              className="rounded p-1 hover:bg-accent hover:text-foreground"
              onClick={() => setEditing(true)}
            >
              ✎
            </button>
            <button
              type="button"
              aria-label={`Remove ${poi.name} from this day`}
              className="rounded p-1 hover:bg-accent hover:text-red-600"
              onClick={() =>
                movePoi.mutate({ poiId: poi.id, dayId: null, orderInDay: 0 })
              }
            >
              ✕
            </button>
          </div>
        ) : null}
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
