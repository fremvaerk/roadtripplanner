"use client";

import { Fragment } from "react";
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
          <Fragment key={p.id}>
            <PoiCard poi={p} index={i} group={id} tripId={tripId} />
            {i < pois.length - 1 && legLabelByAfterPoi[p.id] ? (
              <li aria-hidden="true" className="flex items-center gap-1.5 pl-7 text-xs text-muted-foreground">
                <span aria-hidden="true" className="text-muted-foreground/40">│</span>
                <span>🚗 {legLabelByAfterPoi[p.id]}</span>
              </li>
            ) : null}
          </Fragment>
        ))
      )}
    </ul>
  );
}
