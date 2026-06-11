import type { ExportModel, ExportPoint } from "@/lib/export/itinerary-model";

/**
 * A Google Maps turn-by-turn directions link for one day: origin = where you
 * woke up (previous night, or the trip start on day 0), destination = that day's
 * night (or its last stop if there's no night), waypoints = the in-between stops.
 * Google Maps links carry at most 9 waypoints, so `truncated` flags longer days.
 */
export function dayDirectionsUrl(model: ExportModel, i: number): { url: string; truncated: boolean } {
  const day = model.days[i];
  const origin: ExportPoint = i === 0 ? model.start : (model.days[i - 1].night ?? model.start);
  const seq: ExportPoint[] = [origin, ...day.stops, ...(day.night ? [day.night] : [])];
  const dest = seq[seq.length - 1];
  const mid = seq.slice(1, -1);
  const truncated = mid.length > 9;
  const waypoints = mid.slice(0, 9);
  const ll = (p: { lat: number; lng: number }) => `${p.lat},${p.lng}`;
  const params = [
    `origin=${ll(origin)}`,
    `destination=${ll(dest)}`,
    ...(waypoints.length ? [`waypoints=${waypoints.map(ll).join("|")}`] : []),
    `travelmode=driving`,
  ];
  return { url: `https://www.google.com/maps/dir/?api=1&${params.join("&")}`, truncated };
}

/** Google Maps directions to a single stop from the device's current location (no origin). */
export function stopDirectionsUrl(stop: { lat: number; lng: number }): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${stop.lat},${stop.lng}&travelmode=driving`;
}
