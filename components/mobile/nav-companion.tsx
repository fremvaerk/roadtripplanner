"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { APIProvider } from "@vis.gl/react-google-maps";
import { useTrip } from "@/hooks/use-trip";
import { useRoute } from "@/hooks/use-route";
import { buildExportModel, type ExportPlace } from "@/lib/export/itinerary-model";
import { dayDirectionsUrl, stopDirectionsUrl } from "@/lib/export/maps-links";
import { todayDayIndex } from "@/lib/dates";
import { formatDuration, formatKm } from "@/lib/format";
import { CompanionMap } from "@/components/mobile/companion-map";

/**
 * Mobile-first, read-only trip view focused on launching turn-by-turn
 * navigation. Reuses the shared export model and Google Maps deep links; the
 * `role` prop is accepted for parity with the planner but unused (this view has
 * no edit controls).
 */
export function NavCompanion({
  tripId,
}: {
  tripId: string;
  role?: "owner" | "editor" | "viewer";
}) {
  const { data: trip } = useTrip(tripId);
  const { data: route } = useRoute(tripId);

  const model = useMemo(() => (trip ? buildExportModel(trip, route) : null), [trip, route]);

  // Default the selected day to "today" once per trip.
  const [dayIndex, setDayIndex] = useState(0);
  useEffect(() => {
    if (!trip) return;
    setDayIndex(todayDayIndex(trip.startDate, trip.days.length) ?? 0);
    // Keyed on trip?.id so it only re-runs (and re-defaults) when the trip changes.
  }, [trip?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const focusKey = useRef(0);
  const [focus, setFocus] = useState<{ lat: number; lng: number; key: number } | null>(null);
  const focusOn = (lat: number, lng: number) => {
    focusKey.current += 1;
    setFocus({ lat, lng, key: focusKey.current });
  };

  // Per-day leg labels: a stop's poi id → the drive AFTER it.
  const labels = useMemo<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    if (!trip || !model) return out;
    const day = model.days[dayIndex];
    if (!day) return out;
    const dayId = trip.days.find((td) => td.dayIndex === day.index)?.id;
    if (!dayId) return out;
    for (const leg of route?.legs ?? []) {
      if (
        leg.dayId === dayId &&
        leg.afterPoiId &&
        (leg.durationSeconds > 0 || leg.distanceMeters > 0)
      ) {
        out[leg.afterPoiId] = `🚗 ${formatDuration(leg.durationSeconds)} · ${formatKm(leg.distanceMeters)}`;
      }
    }
    return out;
  }, [trip, route, model, dayIndex]);

  if (!trip) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
  const day = model?.days[dayIndex] ?? null;

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col gap-3 p-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-semibold">{trip.title}</span>
        <span className="flex shrink-0 items-center gap-3">
          <a
            href={`/trips/${tripId}`}
            className="text-xs text-muted-foreground underline"
          >
            Planner
          </a>
          <a href="/" className="text-xs text-muted-foreground underline">
            Trips
          </a>
        </span>
      </div>

      {/* Day chips */}
      {model && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {model.days.map((d, i) => (
            <button
              key={d.index}
              type="button"
              onClick={() => setDayIndex(i)}
              className={`whitespace-nowrap rounded-full border px-3 py-1 text-xs ${
                i === dayIndex
                  ? "bg-primary text-primary-foreground"
                  : "bg-background"
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>
      )}

      {/* Map */}
      {model && day && (
        <div className="h-[42vh] w-full shrink-0 overflow-hidden rounded-md border">
          <APIProvider apiKey={apiKey}>
            <CompanionMap day={day} start={model.start} focusTarget={focus} />
          </APIProvider>
        </div>
      )}

      {/* Navigate whole day */}
      {model && day && (
        <button
          type="button"
          onClick={() => window.open(dayDirectionsUrl(model, dayIndex).url, "_blank")}
          className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
        >
          ▶ Navigate this day
        </button>
      )}

      {/* Stop timeline */}
      {model && day && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted-foreground">
            Start: {day.origin?.name ?? model.start.name}
          </p>

          {day.stops.map((stop, i) => (
            <StopCard
              key={stop.id ?? i}
              stop={stop}
              legLabel={stop.id ? labels[stop.id] : undefined}
              onFocus={() => focusOn(stop.lat, stop.lng)}
            />
          ))}

          {day.night && (
            <div className="rounded-md border bg-background p-2">
              <button
                type="button"
                onClick={() => focusOn(day.night!.lat, day.night!.lng)}
                className="flex w-full items-center gap-2 text-left"
              >
                <span className="text-lg">🛏</span>
                <span className="min-w-0 truncate font-medium">{day.night.name}</span>
              </button>
              <a
                href={stopDirectionsUrl(day.night)}
                target="_blank"
                rel="noreferrer"
                className="mt-2 block rounded-md border px-3 py-2 text-center text-sm font-medium"
              >
                ▶ Navigate
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * A single stop card: tappable row (focuses the map) plus a Navigate deep link.
 * Mirrors poi-card.tsx's broken-image fallback (a `brokenUrl` state + a 📍 box).
 */
function StopCard({
  stop,
  legLabel,
  onFocus,
}: {
  stop: ExportPlace;
  legLabel?: string;
  onFocus: () => void;
}) {
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null);
  useEffect(() => {
    setBrokenUrl(null);
  }, [stop.imageUrl]);

  return (
    <div className="rounded-md border bg-background p-2">
      <button
        type="button"
        onClick={onFocus}
        className="flex w-full items-start gap-2 text-left"
      >
        {stop.imageUrl && stop.imageUrl !== brokenUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={stop.imageUrl}
            alt=""
            onError={() => setBrokenUrl(stop.imageUrl ?? null)}
            className="h-14 w-14 shrink-0 rounded object-cover"
          />
        ) : (
          <div
            aria-hidden="true"
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded bg-muted text-xl text-muted-foreground"
          >
            📍
          </div>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{stop.name}</span>
          {stop.category ? (
            <span className="block truncate text-xs text-muted-foreground">
              {stop.category}
            </span>
          ) : null}
          {stop.address ? (
            <span className="block truncate text-xs text-muted-foreground">
              {stop.address}
            </span>
          ) : null}
        </span>
      </button>

      {legLabel ? (
        <p className="mt-1 text-xs text-muted-foreground">{legLabel}</p>
      ) : null}

      <a
        href={stopDirectionsUrl(stop)}
        target="_blank"
        rel="noreferrer"
        className="mt-2 block rounded-md border px-3 py-2 text-center text-sm font-medium"
      >
        ▶ Navigate
      </a>
    </div>
  );
}
