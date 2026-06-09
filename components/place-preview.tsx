"use client";

import { useEffect, useRef, useState } from "react";
import { useMapsLibrary } from "@vis.gl/react-google-maps";
import { Button } from "@/components/ui/button";
import { categoryFromTypes } from "@/lib/places/category";
import type { AddPoiInput } from "@/lib/itinerary/operations";

type Details = {
  name: string;
  lat: number;
  lng: number;
  address: string | null;
  description: string | null;
  photoUrl: string | null;
  googleMapsUri: string | null;
  types: string[];
};

export function PlacePreview({
  placeId,
  position,
  source,
  alreadyAdded,
  onAdd,
}: {
  placeId: string;
  position: { lat: number; lng: number };
  source: "map" | "search";
  alreadyAdded: boolean;
  onAdd: (input: AddPoiInput) => void;
}) {
  const placesLib = useMapsLibrary("places");
  const [details, setDetails] = useState<Details | null>(null);
  const [loading, setLoading] = useState(true);
  const reqId = useRef(0);

  useEffect(() => {
    if (!placesLib) return;
    const id = ++reqId.current;
    setLoading(true);
    setDetails(null);
    (async () => {
      try {
        const place = new placesLib.Place({ id: placeId });
        await place.fetchFields({
          fields: [
            "displayName",
            "formattedAddress",
            "editorialSummary",
            "photos",
            "location",
            "types",
            "googleMapsURI",
            "id",
          ],
        });
        if (id !== reqId.current) return;
        const loc = place.location;
        setDetails({
          name: place.displayName ?? "Unnamed place",
          lat: loc ? loc.lat() : position.lat,
          lng: loc ? loc.lng() : position.lng,
          address: place.formattedAddress ?? null,
          description: place.editorialSummary ?? null,
          photoUrl: place.photos?.[0]?.getURI({ maxWidth: 320, maxHeight: 180 }) ?? null,
          googleMapsUri: place.googleMapsURI ?? null,
          types: place.types ?? [],
        });
      } catch {
        if (id !== reqId.current) return;
        // Graceful fallback: still addable using the known position.
        setDetails({
          name: "Unnamed place",
          lat: position.lat,
          lng: position.lng,
          address: null,
          description: null,
          photoUrl: null,
          googleMapsUri: null,
          types: [],
        });
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    })();
  }, [placesLib, placeId, position.lat, position.lng]);

  if (loading || !details) {
    return <div className="w-64 p-1 text-sm text-muted-foreground">Loading…</div>;
  }

  const mapsUri =
    details.googleMapsUri ?? `https://www.google.com/maps/place/?q=place_id:${placeId}`;

  return (
    <div className="w-64 text-sm text-foreground">
      {details.photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={details.photoUrl}
          alt={details.name}
          className="mb-2 h-32 w-full rounded object-cover"
        />
      ) : null}
      <div className="font-medium">{details.name}</div>
      {details.address ? (
        <div className="mt-0.5 text-xs text-muted-foreground">{details.address}</div>
      ) : null}
      {details.description ? <p className="mt-1 text-xs">{details.description}</p> : null}
      <a
        href={mapsUri}
        target="_blank"
        rel="noreferrer"
        className="mt-1 block text-xs text-blue-600 underline"
      >
        View on Google Maps
      </a>
      <Button
        size="sm"
        className="mt-2 h-7 w-full text-xs"
        disabled={alreadyAdded}
        onClick={() =>
          onAdd({
            name: details.name,
            lat: details.lat,
            lng: details.lng,
            placeId,
            category: categoryFromTypes(details.types),
            source,
            address: details.address,
            description: details.description,
            imageUrl: details.photoUrl,
          })
        }
      >
        {alreadyAdded ? "Added ✓" : "Add to Places"}
      </Button>
    </div>
  );
}
