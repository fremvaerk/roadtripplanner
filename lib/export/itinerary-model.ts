import type { TripDetail } from "@/lib/api/trips";
import { decodePolyline } from "@/lib/export/polyline";
import { defaultDayColor } from "@/lib/places/group-colors";
import { dayDate } from "@/lib/dates";

export type ExportPoint = { lat: number; lng: number; name: string };
export type ExportPlace = ExportPoint & {
  category?: string | null;
  address?: string | null;
  imageUrl?: string | null;
};
export type ExportDay = {
  index: number;
  label: string;
  color: string;
  stops: ExportPlace[];
  night: ExportPoint | null;
  path: { lat: number; lng: number }[];
};
export type ExportModel = {
  title: string;
  start: ExportPoint;
  end: ExportPoint | null;
  days: ExportDay[];
};

function dayLabel(startDate: string | null, dayIndex: number): string {
  const base = `Day ${dayIndex + 1}`;
  const d = dayDate(startDate, dayIndex);
  if (!d) return base;
  const short = new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(d);
  return base + " · " + short;
}

export function buildExportModel(
  trip: TripDetail,
  route?: { legs: { encodedPolyline: string | null; dayId: string | null }[] },
): ExportModel {
  const start: ExportPoint = { lat: trip.startLat, lng: trip.startLng, name: trip.startName };
  const end: ExportPoint | null =
    trip.endLat != null && trip.endLng != null
      ? { lat: trip.endLat, lng: trip.endLng, name: trip.endName ?? "End" }
      : trip.isRoundTrip
        ? { ...start }
        : null;

  const days: ExportDay[] = [...trip.days]
    .sort((a, b) => a.dayIndex - b.dayIndex)
    .map((day) => {
      const stops: ExportPlace[] = [...day.pois]
        .sort((a, b) => (a.orderInDay ?? 0) - (b.orderInDay ?? 0))
        .map((p) => ({
          lat: p.lat,
          lng: p.lng,
          name: p.name,
          category: p.category,
          address: p.address,
          imageUrl: p.imageUrl,
        }));

      const night: ExportPoint | null = day.night
        ? { lat: day.night.lat, lng: day.night.lng, name: day.night.title ?? "Night stop" }
        : null;

      const color = day.color ?? defaultDayColor(day.dayIndex);

      const path: { lat: number; lng: number }[] = [];
      for (const leg of route?.legs ?? []) {
        if (leg.dayId !== day.id || !leg.encodedPolyline) continue;
        for (const pt of decodePolyline(leg.encodedPolyline)) {
          const last = path[path.length - 1];
          if (last && last.lat === pt.lat && last.lng === pt.lng) continue;
          path.push(pt);
        }
      }

      return {
        index: day.dayIndex,
        label: dayLabel(trip.startDate, day.dayIndex),
        color,
        stops,
        night,
        path,
      };
    });

  return { title: trip.title, start, end, days };
}
