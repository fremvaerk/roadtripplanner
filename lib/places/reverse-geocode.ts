/** Reverse-geocode a point to a place name + id, with a `Pin <lat>, <lng>` fallback
 *  on no result or error. The caller keeps the exact lat/lng it passed in. */
export async function reverseGeocode(
  geocodingLib: google.maps.GeocodingLibrary,
  lat: number,
  lng: number,
): Promise<{ name: string; placeId: string | null }> {
  const fallback = { name: `Pin ${lat.toFixed(4)}, ${lng.toFixed(4)}`, placeId: null };
  try {
    const geocoder = new geocodingLib.Geocoder();
    const { results } = await geocoder.geocode({ location: { lat, lng } });
    if (results[0]) {
      return { name: results[0].formatted_address, placeId: results[0].place_id ?? null };
    }
  } catch {
    // fall through to fallback
  }
  return fallback;
}
