"use client";

import { useEffect, useRef, useState } from "react";
import { useMapsLibrary } from "@vis.gl/react-google-maps";
import { Button } from "@/components/ui/button";
import { useUpdatePoi, useMovePoi } from "@/hooks/use-poi-mutations";
import { googleMapsUrl } from "@/lib/places/maps-url";
import type { PoiDetail } from "@/lib/api/trips";

export function PlaceInfoPopup({
  poi,
  tripId,
  days = [],
  onEdit,
  onRemove,
}: {
  poi: PoiDetail;
  tripId: string;
  days?: { id: string; label: string }[];
  onEdit: () => void;
  onRemove: () => void;
}) {
  const placesLib = useMapsLibrary("places");
  const updatePoi = useUpdatePoi(tripId);
  const movePoi = useMovePoi(tripId);

  function onAssign(value: string) {
    if (value === "") movePoi.mutate({ poiId: poi.id, dayId: null, orderInDay: 0 });
    else movePoi.mutate({ poiId: poi.id, dayId: value, orderInDay: 9999 });
  }
  const [enriched, setEnriched] = useState<{ imageUrl: string | null; address: string | null; placeId: string | null } | null>(null);
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null);
  const startedRef = useRef(false);

  const needsEnrich = !poi.imageUrl && !poi.address;

  useEffect(() => {
    if (!needsEnrich || !placesLib || startedRef.current) return;
    startedRef.current = true;
    (async () => {
      try {
        let place: google.maps.places.Place | null = null;
        if (poi.placeId) {
          place = new placesLib.Place({ id: poi.placeId });
          await place.fetchFields({ fields: ["photos", "formattedAddress", "id"] });
        } else {
          const { places } = await placesLib.Place.searchNearby({
            fields: ["photos", "formattedAddress", "id"],
            locationRestriction: { center: { lat: poi.lat, lng: poi.lng }, radius: 150 },
            maxResultCount: 1,
            rankPreference: placesLib.SearchNearbyRankPreference.DISTANCE,
          });
          place = places[0] ?? null;
        }
        if (!place) return;
        const imageUrl = place.photos?.[0]?.getURI({ maxWidth: 400, maxHeight: 240 }) ?? null;
        const address = place.formattedAddress ?? null;
        const newPlaceId = place.id ?? null;
        setEnriched({ imageUrl, address, placeId: newPlaceId });
        // Persist when anything new was resolved (incl. a newly-found placeId), and
        // mirror imageUrl's `?? undefined` so a null never clobbers a stored value.
        if (imageUrl || address || (newPlaceId && newPlaceId !== poi.placeId)) {
          updatePoi.mutate({
            poiId: poi.id,
            imageUrl: imageUrl ?? undefined,
            address: address ?? undefined,
            placeId: newPlaceId ?? undefined,
          });
        }
      } catch {
        // keep the stored info on any fetch/search failure
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placesLib]);

  const imageUrl = poi.imageUrl ?? enriched?.imageUrl ?? null;
  const address = poi.address ?? enriched?.address ?? null;

  return (
    <div className="w-64 text-sm text-foreground">
      {imageUrl && imageUrl !== brokenUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt={poi.name}
          onError={() => setBrokenUrl(imageUrl)}
          className="mb-2 h-32 w-full rounded object-cover"
        />
      ) : null}
      <div className="font-medium">{poi.name}</div>
      {poi.category ? <div className="text-xs text-muted-foreground">{poi.category}</div> : null}
      {address ? <div className="mt-0.5 text-xs text-muted-foreground">{address}</div> : null}
      {poi.description ? <p className="mt-1 text-xs">{poi.description}</p> : null}
      <a
        href={googleMapsUrl(poi.lat, poi.lng, poi.placeId ?? enriched?.placeId ?? null)}
        target="_blank"
        rel="noreferrer"
        className="mt-1 block text-xs text-blue-600 underline"
      >
        View on Google Maps
      </a>
      {days.length > 0 ? (
        <div className="mt-2 flex items-center gap-2">
          <label className="text-xs text-muted-foreground">Day</label>
          <select
            aria-label={`Assign ${poi.name} to a day`}
            className="min-w-0 flex-1 rounded border bg-background px-1 py-0.5 text-xs"
            value={poi.dayId ?? ""}
            onChange={(e) => onAssign(e.target.value)}
          >
            <option value="">— Unassigned</option>
            {days.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <div className="mt-2 flex gap-2">
        <Button size="sm" variant="outline" className="h-7 flex-1 text-xs" onClick={onEdit}>
          ✎ Edit
        </Button>
        <Button size="sm" variant="destructive" className="h-7 flex-1 text-xs" onClick={onRemove}>
          ✕ Remove
        </Button>
      </div>
    </div>
  );
}
