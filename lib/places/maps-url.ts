/** A Google Maps link to a point, biased to a specific place when its id is known. */
export function googleMapsUrl(lat: number, lng: number, placeId?: string | null): string {
  const base = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  return placeId ? `${base}&query_place_id=${placeId}` : base;
}
