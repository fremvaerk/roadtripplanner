import type { ResolvedLocation } from "@/lib/trips/schema";

const GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json";

export class GeocodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeocodeError";
  }
}

export async function geocodePlace(
  query: string,
  apiKey: string | undefined = process.env.GOOGLE_MAPS_SERVER_KEY,
): Promise<ResolvedLocation> {
  if (!apiKey) throw new GeocodeError("Missing GOOGLE_MAPS_SERVER_KEY");

  const url = `${GEOCODE_URL}?address=${encodeURIComponent(query)}&key=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) throw new GeocodeError(`Geocoding request failed (HTTP ${res.status})`);

  const data = (await res.json()) as {
    status: string;
    results?: Array<{
      formatted_address?: string;
      place_id?: string;
      geometry: { location: { lat: number; lng: number } };
    }>;
  };

  if (data.status !== "OK" || !data.results?.length) {
    throw new GeocodeError(`Could not find location "${query}" (${data.status})`);
  }

  const r = data.results[0];
  return {
    name: r.formatted_address ?? query,
    lat: r.geometry.location.lat,
    lng: r.geometry.location.lng,
    placeId: r.place_id ?? null,
  };
}
