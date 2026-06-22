"use client";

import { useDroppable } from "@dnd-kit/react";
import { PoiCard } from "@/components/poi-card";
import { CarIcon } from "@/components/ui/icons";
import type { PoiDetail } from "@/lib/api/trips";

export function PoiContainer({
  id,
  pois,
  tripId,
  emptyText,
  legLabelByAfterPoi = {},
  entryLegLabel = null,
  onFocusPlace,
}: {
  id: string;
  pois: PoiDetail[];
  tripId: string;
  emptyText: string;
  legLabelByAfterPoi?: Record<string, string>;
  entryLegLabel?: string | null;
  onFocusPlace?: (lat: number, lng: number) => void;
}) {
  const { ref } = useDroppable({ id, type: "poi", accept: "poi" });
  return (
    <ul ref={ref} className="min-h-10 space-y-1">
      {pois.length === 0 ? (
        <li className="px-1 py-2 text-xs text-muted-foreground">{emptyText}</li>
      ) : (
        <>
          {/* Drive from the previous night / trip start into the first place. */}
          {entryLegLabel ? (
            <li
              aria-hidden="true"
              className="flex items-center gap-1.5 pl-7 text-xs text-muted-foreground"
            >
              <span className="text-muted-foreground/40">│</span>
              <span className="inline-flex items-center gap-1"><CarIcon /> {entryLegLabel}</span>
            </li>
          ) : null}
          {pois.map((p, i) => (
            <PoiCard
              key={p.id}
              poi={p}
              index={i}
              group={id}
              tripId={tripId}
              legBelow={legLabelByAfterPoi[p.id] ?? null}
              onFocusPlace={onFocusPlace}
            />
          ))}
        </>
      )}
    </ul>
  );
}
