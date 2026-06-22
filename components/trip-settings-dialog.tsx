"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PlaceAutocomplete } from "@/components/place-autocomplete";
import { useUpdateTripBase, useSetTripTitle } from "@/hooks/use-trip-mutations";
import { useSetStartDate } from "@/hooks/use-day-mutations";
import type { TripDetail } from "@/lib/api/trips";

/** Edit a trip's name, start, finish, and start date in a modal (replaces the
 *  inline Settings section + the editable title in the planner header). */
export function TripSettingsDialog({
  trip,
  onClose,
}: {
  trip: TripDetail;
  onClose: () => void;
}) {
  const updateBase = useUpdateTripBase(trip.id);
  const setTitle = useSetTripTitle(trip.id);
  const setStartDate = useSetStartDate(trip.id);

  const [pendingMode, setPendingMode] = useState<null | "open" | "round" | "place">(null);
  const finishMode: "open" | "round" | "place" =
    trip.endLat != null ? "place" : trip.isRoundTrip ? "round" : "open";
  const activeFinish = pendingMode ?? finishMode;

  // Drop the optimistic finish override once the server reflects it.
  useEffect(() => {
    setPendingMode(null);
  }, [trip.endLat, trip.endLng, trip.isRoundTrip]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Trip settings"
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border bg-card p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">Trip settings</h2>
          <button
            type="button"
            aria-label="Close"
            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="ts-name" className="text-xs">Trip name</Label>
            <Input
              id="ts-name"
              key={trip.title}
              defaultValue={trip.title}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v && v !== trip.title) setTitle.mutate(v);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Start</Label>
            <div className="text-xs text-muted-foreground">
              Currently: <span className="text-foreground">{trip.startName}</span>
            </div>
            <PlaceAutocomplete
              placeholder="Change start…"
              onPick={(p) =>
                updateBase.mutate({ start: { name: p.name, lat: p.lat, lng: p.lng, placeId: p.placeId } })
              }
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Finish</Label>
            <div role="group" aria-label="Finish mode" className="flex gap-1">
              <Button
                size="sm"
                variant={activeFinish === "open" ? "default" : "outline"}
                aria-pressed={activeFinish === "open"}
                className="h-7 flex-1 text-xs"
                onClick={() => { setPendingMode("open"); updateBase.mutate({ finish: { mode: "open" } }); }}
              >
                Open
              </Button>
              <Button
                size="sm"
                variant={activeFinish === "round" ? "default" : "outline"}
                aria-pressed={activeFinish === "round"}
                className="h-7 flex-1 text-xs"
                onClick={() => { setPendingMode("round"); updateBase.mutate({ finish: { mode: "round" } }); }}
              >
                Round trip
              </Button>
              <Button
                size="sm"
                variant={activeFinish === "place" ? "default" : "outline"}
                aria-pressed={activeFinish === "place"}
                className="h-7 flex-1 text-xs"
                onClick={() => setPendingMode("place")}
              >
                Place
              </Button>
            </div>
            {activeFinish === "place" && !updateBase.isPending && (
              <div className="space-y-1">
                {trip.endName ? (
                  <div className="text-xs text-muted-foreground">
                    Ends at: <span className="text-foreground">{trip.endName}</span>
                  </div>
                ) : null}
                <PlaceAutocomplete
                  placeholder="Search destination…"
                  onPick={(p) =>
                    updateBase.mutate({
                      finish: { mode: "place", place: { name: p.name, lat: p.lat, lng: p.lng, placeId: p.placeId } },
                    })
                  }
                />
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ts-date" className="text-xs">Start date</Label>
            <input
              id="ts-date"
              type="date"
              value={trip.startDate ? trip.startDate.slice(0, 10) : ""}
              onChange={(e) => setStartDate.mutate(e.target.value || null)}
              className="block rounded-md border bg-background px-2 py-1.5 text-sm"
            />
          </div>
        </div>

        <div className="mt-5 flex justify-end">
          <Button size="sm" onClick={onClose}>Done</Button>
        </div>
      </div>
    </div>
  );
}
