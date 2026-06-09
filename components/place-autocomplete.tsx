"use client";

import { useEffect, useRef, useState } from "react";
import { useMapsLibrary } from "@vis.gl/react-google-maps";
import { Input } from "@/components/ui/input";
import { useMapPick } from "@/components/map-pick-context";

export type PlacePick = {
  name: string;
  lat: number;
  lng: number;
  placeId: string | null;
  types: string[];
};

export function PlaceAutocomplete({
  placeholder,
  onPick,
  ariaLabel,
  className,
  pickId,
}: {
  placeholder: string;
  onPick: (p: PlacePick) => void;
  ariaLabel?: string;
  className?: string;
  pickId?: string;
}) {
  const placesLib = useMapsLibrary("places");
  const mapPick = useMapPick();
  const armed = !!pickId && mapPick?.armedId === pickId;
  useEffect(() => {
    return () => {
      if (pickId && mapPick) mapPick.disarm(pickId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [value, setValue] = useState("");
  const [predictions, setPredictions] = useState<google.maps.places.PlacePrediction[]>([]);
  const sessionToken = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const reqId = useRef(0);

  async function onChange(input: string) {
    setValue(input);
    if (!placesLib || input.trim().length < 2) {
      setPredictions([]);
      return;
    }
    if (!sessionToken.current) {
      sessionToken.current = new placesLib.AutocompleteSessionToken();
    }
    const id = ++reqId.current;
    const { suggestions } =
      await placesLib.AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input,
        sessionToken: sessionToken.current,
      });
    if (id !== reqId.current) return; // a newer keystroke superseded this response
    setPredictions(
      suggestions
        .map((s) => s.placePrediction)
        .filter((p): p is google.maps.places.PlacePrediction => p != null),
    );
  }

  async function pick(prediction: google.maps.places.PlacePrediction) {
    const place = prediction.toPlace();
    await place.fetchFields({ fields: ["location", "displayName", "id", "types"] });
    const loc = place.location;
    if (!loc) return;
    onPick({
      name: place.displayName ?? prediction.mainText?.text ?? "Unnamed place",
      lat: loc.lat(),
      lng: loc.lng(),
      placeId: place.id ?? null,
      types: place.types ?? [],
    });
    if (pickId && mapPick) mapPick.disarm(pickId);
    setValue("");
    setPredictions([]);
    sessionToken.current = null;
  }

  return (
    <div className={`relative ${className ?? ""}${armed ? " rounded-md ring-2 ring-blue-500" : ""}`}>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => {
          if (pickId && mapPick) mapPick.arm(pickId, onPick);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape" && pickId && mapPick) {
            mapPick.disarm(pickId);
            (e.currentTarget as HTMLInputElement).blur();
          }
        }}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
      />
      {predictions.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded-md border bg-background shadow">
          {predictions.map((p) => (
            <li key={p.placeId}>
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm hover:bg-accent"
                onClick={() => pick(p)}
              >
                <span className="font-medium">{p.mainText?.text ?? p.text?.text}</span>
                {p.secondaryText?.text && (
                  <span className="block text-xs text-muted-foreground">
                    {p.secondaryText.text}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
