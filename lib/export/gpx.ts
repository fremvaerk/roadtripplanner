import type { ExportModel, ExportPoint } from "@/lib/export/itinerary-model";

/** Escape text for inclusion in XML element content. `&` must be escaped first. */
export function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function wpt(p: ExportPoint): string {
  return `<wpt lat="${p.lat}" lon="${p.lng}"><name>${esc(p.name)}</name></wpt>`;
}

function trkpt(p: { lat: number; lng: number }): string {
  return `<trkpt lat="${p.lat}" lon="${p.lng}"></trkpt>`;
}

/**
 * Serialize an ExportModel to GPX 1.1 for offline navigation apps / GPS devices.
 * Waypoints come first (start, then each day's stops + night, then the trip end),
 * followed by one track per day.
 */
export function buildGpx(model: ExportModel): string {
  const parts: string[] = [];
  parts.push('<?xml version="1.0" encoding="UTF-8"?>');
  parts.push('<gpx version="1.1" creator="RoadTripPlanner" xmlns="http://www.topografix.com/GPX/1/1">');

  // Waypoints: start, then each day's stops then night, then trip end.
  parts.push(wpt(model.start));
  for (const day of model.days) {
    for (const stop of day.stops) parts.push(wpt(stop));
    if (day.night) parts.push(wpt(day.night));
  }
  if (model.end) parts.push(wpt(model.end));

  // One track per day.
  for (const day of model.days) {
    const points =
      day.path.length > 0
        ? day.path
        : [...day.stops, ...(day.night ? [day.night] : [])];
    parts.push("<trk>");
    parts.push(`<name>${esc(day.label)}</name>`);
    parts.push("<trkseg>");
    for (const pt of points) parts.push(trkpt(pt));
    parts.push("</trkseg>");
    parts.push("</trk>");
  }

  parts.push("</gpx>");
  return parts.join("");
}
