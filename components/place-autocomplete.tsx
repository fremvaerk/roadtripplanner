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

  function toggleArm() {
    if (!pickId || !mapPick) return;
    if (armed) mapPick.disarm(pickId);
    else mapPick.arm(pickId, onPick);
  }

  return (
    <div className={`relative ${className ?? ""}${armed ? " rounded-md ring-2 ring-blue-500" : ""}`}>
      <div className="flex gap-1">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape" && pickId && mapPick) {
              mapPick.disarm(pickId);
              (e.currentTarget as HTMLInputElement).blur();
            }
          }}
          placeholder={placeholder}
          aria-label={ariaLabel ?? placeholder}
          className="flex-1"
        />
        {pickId && mapPick && (
          <button
            type="button"
            onClick={toggleArm}
            aria-label="Pick on map"
            aria-pressed={armed}
            title="Pick on map"
            className={`shrink-0 rounded-md border px-2 text-sm ${
              armed ? "border-blue-400 bg-blue-100 text-blue-700" : "text-muted-foreground hover:bg-accent"
            }`}
          >
            📍
          </button>
        )}
      </div>
      {armed && predictions.length === 0 && (
        <p className="mt-1 text-xs text-blue-600">Click the map to set this location · Esc to cancel.</p>
      )}
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
