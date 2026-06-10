export type LatLng = { lat: number; lng: number };

const DECIMAL = /^(-?\d+(?:\.\d+)?)\s*(?:,\s*|\s+)(-?\d+(?:\.\d+)?)$/;
// A DMS degree-block (unsigned magnitude): degrees (required, with °), then optional
// minutes (straight/typographic/prime quote) and seconds (straight/typographic/double-prime).
const DMS_BLOCK =
  /(\d+(?:\.\d+)?)\s*°\s*(?:(\d+(?:\.\d+)?)\s*['’′]\s*)?(?:(\d+(?:\.\d+)?)\s*["”″])?/g;

function parseDecimal(input: string): LatLng | null {
  const m = input.trim().match(DECIMAL);
  if (!m) return null;
  return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };
}

function parseDms(input: string): LatLng | null {
  const values: number[] = [];
  for (const m of input.matchAll(DMS_BLOCK)) {
    const deg = parseFloat(m[1]);
    const min = m[2] ? parseFloat(m[2]) : 0;
    const sec = m[3] ? parseFloat(m[3]) : 0;
    values.push(deg + min / 60 + sec / 3600);
  }
  if (values.length !== 2) return null;

  const hemis = input.toUpperCase().match(/[NSEW]/g) ?? [];
  if (hemis.length === 0) return { lat: values[0], lng: values[1] };
  if (hemis.length !== 2) return null;

  const signed = values.map((v, i) => (hemis[i] === "S" || hemis[i] === "W" ? -v : v));
  const latIdx = hemis.findIndex((h) => h === "N" || h === "S");
  const lngIdx = hemis.findIndex((h) => h === "E" || h === "W");
  if (latIdx === -1 || lngIdx === -1) return null;
  return { lat: signed[latIdx], lng: signed[lngIdx] };
}

/** Parse a typed coordinate pair — decimal (`67.23, 14.62`) or DMS
 *  (`N 59°53'52.6668" E 17°38'7.5552"`). Returns null if it isn't a valid pair. */
export function parseCoordinates(input: string): LatLng | null {
  const coords = parseDecimal(input) ?? parseDms(input);
  if (!coords) return null;
  const { lat, lng } = coords;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}
