"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { APIProvider } from "@vis.gl/react-google-maps";
import { useMapsConfig } from "@/components/maps-config";
import { PlaceAutocomplete, type PlacePick } from "@/components/place-autocomplete";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { safeHttpUrl } from "@/lib/url";

type FinishMode = "open" | "round" | "place";

export function TripForm() {
  const { apiKey } = useMapsConfig();
  return (
    <APIProvider apiKey={apiKey} language="en">
      <TripFormInner />
    </APIProvider>
  );
}

function TripFormInner() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [start, setStart] = useState<PlacePick | null>(null);
  const [finishMode, setFinishMode] = useState<FinishMode>("open");
  const [finishPlace, setFinishPlace] = useState<PlacePick | null>(null);
  const [startDate, setStartDate] = useState("");
  const [coverUrl, setCoverUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const pick = (p: PlacePick) => ({ name: p.name, lat: p.lat, lng: p.lng, placeId: p.placeId });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim()) return setError("Give your trip a name.");
    if (!start) return setError("Search for and pick a start location.");
    if (finishMode === "place" && !finishPlace) return setError("Pick a destination, or choose Open / Round trip.");

    const finish =
      finishMode === "place"
        ? { mode: "place" as const, place: pick(finishPlace!) }
        : { mode: finishMode };

    setSubmitting(true);
    try {
      const res = await fetch("/api/trips", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          start: pick(start),
          startDate: startDate || null,
          finish,
          coverImage: coverUrl.trim() ? safeHttpUrl(coverUrl) : null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(typeof data.error === "string" ? data.error : "Could not create trip.");
        setSubmitting(false);
        return;
      }
      const trip = await res.json();
      router.push(`/trips/${trip.id}`);
    } catch {
      setError("Network error. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="title">Trip name</Label>
        <Input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Nordkapp Road Trip 2026"
          required
        />
      </div>

      <div className="space-y-1.5">
        <Label>Start</Label>
        {start && (
          <div className="text-xs text-muted-foreground">
            Selected: <span className="text-foreground">{start.name}</span>
          </div>
        )}
        <PlaceAutocomplete placeholder="Search a start location…" onPick={setStart} />
      </div>

      <div className="space-y-1.5">
        <Label>Finish</Label>
        <div role="group" aria-label="Finish mode" className="flex gap-1">
          {(["open", "round", "place"] as const).map((m) => (
            <Button
              key={m}
              type="button"
              size="sm"
              variant={finishMode === m ? "default" : "outline"}
              aria-pressed={finishMode === m}
              className="h-7 flex-1 text-xs"
              onClick={() => setFinishMode(m)}
            >
              {m === "open" ? "Open" : m === "round" ? "Round trip" : "Place"}
            </Button>
          ))}
        </div>
        {finishMode === "place" && (
          <div className="space-y-1">
            {finishPlace && (
              <div className="text-xs text-muted-foreground">
                Ends at: <span className="text-foreground">{finishPlace.name}</span>
              </div>
            )}
            <PlaceAutocomplete placeholder="Search destination…" onPick={setFinishPlace} />
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="startDate">Start date</Label>
        <input
          id="startDate"
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="block rounded-md border bg-background px-2 py-1.5 text-sm"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="cover">Cover image URL (optional)</Label>
        <Input
          id="cover"
          value={coverUrl}
          onChange={(e) => setCoverUrl(e.target.value)}
          placeholder="https://…"
        />
        <p className="text-xs text-muted-foreground">
          Or pick one from a place photo later in Settings.
        </p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <Button type="submit" disabled={submitting}>
        {submitting ? "Creating…" : "Create trip"}
      </Button>
    </form>
  );
}
