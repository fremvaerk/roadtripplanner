"use client";

import { Button } from "@/components/ui/button";
import { googleMapsUrl } from "@/lib/places/maps-url";

/**
 * Map popup for a night stop — the night-marker analogue of PlaceInfoPopup.
 * Shows the stay (hotel title, "Night N - dates", booking link, notes) plus
 * Edit / Remove. A multi-night stay covers several days (all `dayIds`); Edit
 * targets the first night, Remove clears the whole stay.
 */
export function NightInfoPopup({
  title,
  stayLabel,
  url,
  notes,
  lat,
  lng,
  dayIds,
  canEdit = true,
  onEdit,
  onRemove,
}: {
  title: string | null;
  stayLabel: string;
  url: string | null;
  notes: string | null;
  lat: number;
  lng: number;
  dayIds: string[];
  canEdit?: boolean;
  onEdit: (dayId: string) => void;
  onRemove: (dayIds: string[]) => void;
}) {
  const link = url?.trim() || null;
  return (
    <div className="w-60 text-sm text-foreground">
      <div className="flex items-center gap-1 font-medium">
        <span>🛏️</span>
        <span className="min-w-0 truncate">{title || "Night stop"}</span>
      </div>
      <div className="mt-0.5 text-xs text-muted-foreground">{stayLabel}</div>
      {link ? (
        <a
          href={link}
          target="_blank"
          rel="noreferrer"
          className="mt-1 block truncate text-xs text-blue-600 underline"
        >
          Open booking ↗
        </a>
      ) : null}
      {notes ? <p className="mt-1 whitespace-pre-wrap text-xs">{notes}</p> : null}
      <a
        href={googleMapsUrl(lat, lng, null)}
        target="_blank"
        rel="noreferrer"
        className="mt-1 block text-xs text-blue-600 underline"
      >
        View on Google Maps
      </a>
      {canEdit ? (
        <div className="mt-2 flex gap-2">
          <Button size="sm" variant="outline" className="h-7 flex-1 text-xs" onClick={() => onEdit(dayIds[0])}>
            ✎ Edit
          </Button>
          <Button size="sm" variant="destructive" className="h-7 flex-1 text-xs" onClick={() => onRemove(dayIds)}>
            ✕ Remove
          </Button>
        </div>
      ) : null}
    </div>
  );
}
