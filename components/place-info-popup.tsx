"use client";

import { useEffect, useRef, useState } from "react";
import { useMapsLibrary } from "@vis.gl/react-google-maps";
import { Button } from "@/components/ui/button";
import { useUpdatePoi } from "@/hooks/use-poi-mutations";
import { googleMapsUrl } from "@/lib/places/maps-url";
import type { PoiDetail } from "@/lib/api/trips";

export function PlaceInfoPopup({
  poi,
  tripId,
  onEdit,
  onRemove,
}: {
  poi: PoiDetail;
  tripId: string;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const placesLib = useMapsLibrary("places");
  const updatePoi = useUpdatePoi(tripId);
  const [enriched, setEnriched] = useState<{ imageUrl: string | null; address: string | null } | null>(null);
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
        const placeId = place.id ?? poi.placeId ?? null;
        setEnriched({ imageUrl, address });
        if (imageUrl || address) {
          updatePoi.mutate({ poiId: poi.id, imageUrl: imageUrl ?? undefined, address, placeId });
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
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt={poi.name} className="mb-2 h-32 w-full rounded object-cover" />
      ) : null}
      <div className="font-medium">{poi.name}</div>
      {poi.category ? <div className="text-xs text-muted-foreground">{poi.category}</div> : null}
      {address ? <div className="mt-0.5 text-xs text-muted-foreground">{address}</div> : null}
      {poi.description ? <p className="mt-1 text-xs">{poi.description}</p> : null}
      <a
        href={googleMapsUrl(poi.lat, poi.lng, poi.placeId)}
        target="_blank"
        rel="noreferrer"
        className="mt-1 block text-xs text-blue-600 underline"
      >
        View on Google Maps
      </a>
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
