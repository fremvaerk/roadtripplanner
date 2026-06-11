"use client";

import { useDroppable } from "@dnd-kit/react";
import { PoiCard } from "@/components/poi-card";
import type { PoiDetail } from "@/lib/api/trips";

export function PoiContainer({
  id,
  pois,
  tripId,
  emptyText,
  legLabelByAfterPoi = {},
}: {
  id: string;
  pois: PoiDetail[];
  tripId: string;
  emptyText: string;
  legLabelByAfterPoi?: Record<string, string>;
}) {
  const { ref } = useDroppable({ id, type: "poi", accept: "poi" });
  return (
    <ul ref={ref} className="min-h-10 space-y-1">
      {pois.length === 0 ? (
        <li className="px-1 py-2 text-xs text-muted-foreground">{emptyText}</li>
      ) : (
        pois.map((p, i) => (
          <PoiCard
            key={p.id}
            poi={p}
            index={i}
            group={id}
            tripId={tripId}
            legBelow={
              i < pois.length - 1 ? (legLabelByAfterPoi[p.id] ?? null) : null
            }
          />
        ))
      )}
    </ul>
  );
}
