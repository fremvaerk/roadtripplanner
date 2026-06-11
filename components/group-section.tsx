"use client";

import { useDroppable } from "@dnd-kit/react";
import { CatalogRow } from "@/components/catalog-row";
import type { PoiDetail, DayDetail } from "@/lib/api/trips";

export function GroupSection({
  containerId,
  pois,
  tripId,
  days,
  onFocusPlace,
}: {
  containerId: string;
  pois: PoiDetail[];
  tripId: string;
  days: DayDetail[];
  onFocusPlace?: (lat: number, lng: number) => void;
}) {
  const { ref } = useDroppable({ id: containerId, type: "poi", accept: "poi" });
  return (
    <ul ref={ref} className="min-h-8 space-y-1">
      {pois.length === 0 ? (
        <li className="px-1 py-1 text-xs text-muted-foreground">
          No places here.
        </li>
      ) : (
        pois.map((p, i) => (
          <CatalogRow
            key={p.id}
            poi={p}
            index={i}
            group={containerId}
            tripId={tripId}
            days={days}
            onFocusPlace={onFocusPlace}
          />
        ))
      )}
    </ul>
  );
}
