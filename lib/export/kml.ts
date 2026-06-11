import type { ExportModel, ExportPlace, ExportPoint } from "@/lib/export/itinerary-model";

export function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function kmlColor(color: string): string {
  const hex = color.replace(/^#/, "").toLowerCase();
  const rr = hex.slice(0, 2);
  const gg = hex.slice(2, 4);
  const bb = hex.slice(4, 6);
  return "ff" + bb + gg + rr;
}

function coord(p: { lat: number; lng: number }): string {
  return `${p.lng},${p.lat},0`;
}

function pointPlacemark(name: string, p: ExportPoint): string {
  return (
    `<Placemark>` +
    `<name>${esc(name)}</name>` +
    `<Point><coordinates>${coord(p)}</coordinates></Point>` +
    `</Placemark>`
  );
}

function stopPlacemark(stop: ExportPlace): string {
  const lines: string[] = [];
  if (stop.category) lines.push(stop.category);
  if (stop.address) lines.push(stop.address);
  let description = lines.join("\n");
  if (stop.imageUrl) {
    if (description) description += "\n";
    description += `<img src="${stop.imageUrl}"/>`;
  }
  return (
    `<Placemark>` +
    `<name>${esc(stop.name)}</name>` +
    `<description><![CDATA[${description}]]></description>` +
    `<Point><coordinates>${coord(stop)}</coordinates></Point>` +
    `</Placemark>`
  );
}

export function buildKml(model: ExportModel): string {
  const parts: string[] = [];
  parts.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  parts.push(`<kml xmlns="http://www.opengis.net/kml/2.2"><Document>`);
  parts.push(`<name>${esc(model.title)}</name>`);

  for (const day of model.days) {
    parts.push(
      `<Style id="day${day.index}">` +
        `<LineStyle><color>${kmlColor(day.color)}</color><width>4</width></LineStyle>` +
        `</Style>`,
    );
  }

  parts.push(pointPlacemark(`Start: ${model.start.name}`, model.start));
  if (model.end) {
    parts.push(pointPlacemark(`End: ${model.end.name}`, model.end));
  }

  for (const day of model.days) {
    parts.push(`<Folder>`);
    parts.push(`<name>${esc(day.label)}</name>`);

    const routePoints =
      day.path.length > 0
        ? day.path
        : [...day.stops, ...(day.night ? [day.night] : [])];
    let route = `<Placemark>` + `<styleUrl>#day${day.index}</styleUrl>`;
    if (routePoints.length > 0) {
      route +=
        `<LineString><tessellate>1</tessellate>` +
        `<coordinates>${routePoints.map(coord).join(" ")}</coordinates>` +
        `</LineString>`;
    }
    route += `</Placemark>`;
    parts.push(route);

    for (const stop of day.stops) {
      parts.push(stopPlacemark(stop));
    }

    if (day.night) {
      parts.push(pointPlacemark(day.night.name, day.night));
    }

    parts.push(`</Folder>`);
  }

  parts.push(`</Document></kml>`);
  return parts.join("");
}
