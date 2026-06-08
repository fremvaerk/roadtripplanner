"use client";

import { PlaceAutocomplete } from "@/components/place-autocomplete";
import { categoryFromTypes } from "@/lib/places/category";
import { useAddPoi } from "@/hooks/use-poi-mutations";

export function PlaceSearch({ tripId }: { tripId: string }) {
  const addPoi = useAddPoi(tripId);
  return (
    <PlaceAutocomplete
      placeholder="Search a place to add…"
      ariaLabel="Search a place to add"
      onPick={(p) =>
        addPoi.mutate({
          name: p.name,
          lat: p.lat,
          lng: p.lng,
          placeId: p.placeId ?? undefined,
          category: categoryFromTypes(p.types),
          source: "search",
        })
      }
    />
  );
}
