import { categoryFromTypes } from "@/lib/places/category";

export type PlaceResult = {
  name: string;
  lat: number;
  lng: number;
  placeId: string | null;
  category: string; // categoryFromTypes always returns a value ("other" fallback)
  address: string | null;
  types: string[];
};

export class PlaceSearchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlaceSearchError";
  }
}

const FIELD_MASK =
  "places.displayName,places.location,places.id,places.types,places.formattedAddress";

type RawPlace = {
  displayName?: { text?: string };
  location?: { latitude?: number; longitude?: number };
  id?: string;
  types?: string[];
  formattedAddress?: string;
};

function normalize(p: RawPlace): PlaceResult {
  const types = p.types ?? [];
  return {
    name: p.displayName?.text ?? "",
    lat: p.location?.latitude ?? 0,
    lng: p.location?.longitude ?? 0,
    placeId: p.id ?? null,
    category: categoryFromTypes(types),
    address: p.formattedAddress ?? null,
    types,
  };
}

async function call(
  url: string,
  body: unknown,
  apiKey: string | undefined,
): Promise<PlaceResult[]> {
  if (!apiKey) throw new PlaceSearchError("Missing GOOGLE_MAPS_SERVER_KEY");
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": FIELD_MASK,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new PlaceSearchError(`Places search failed (HTTP ${res.status})`);
  const data = (await res.json()) as { places?: RawPlace[] };
  return (data.places ?? []).map(normalize);
}

/** Text search; optionally biased toward a point. */
export async function searchPlacesText(
  query: string,
  opts: { near?: { lat: number; lng: number }; radiusMeters?: number; limit?: number } = {},
  apiKey: string | undefined = process.env.GOOGLE_MAPS_SERVER_KEY,
): Promise<PlaceResult[]> {
  const body: Record<string, unknown> = { textQuery: query, maxResultCount: opts.limit ?? 10 };
  if (opts.near) {
    body.locationBias = {
      circle: {
        center: { latitude: opts.near.lat, longitude: opts.near.lng },
        radius: opts.radiusMeters ?? 50000,
      },
    };
  }
  return call("https://places.googleapis.com/v1/places:searchText", body, apiKey);
}

/** Nearby search around a center. */
export async function searchPlacesNearby(
  center: { lat: number; lng: number },
  radiusMeters: number,
  opts: { includedTypes?: string[]; limit?: number } = {},
  apiKey: string | undefined = process.env.GOOGLE_MAPS_SERVER_KEY,
): Promise<PlaceResult[]> {
  const body: Record<string, unknown> = {
    locationRestriction: {
      circle: { center: { latitude: center.lat, longitude: center.lng }, radius: radiusMeters },
    },
    maxResultCount: opts.limit ?? 10,
    rankPreference: "POPULARITY",
  };
  if (opts.includedTypes?.length) body.includedTypes = opts.includedTypes;
  return call("https://places.googleapis.com/v1/places:searchNearby", body, apiKey);
}
