const ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";

export class RouteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RouteError";
  }
}

export type LatLngLiteral = { lat: number; lng: number };
export type RouteWaypoint = { lat: number; lng: number; via?: boolean };
export type RouteLeg = { durationSeconds: number; distanceMeters: number; encodedPolyline?: string };
export type ComputedRoute = {
  encodedPolyline: string;
  legs: RouteLeg[];
  totalDurationSeconds: number;
  totalDistanceMeters: number;
  optimizedOrder?: number[];
};

function toWaypoint(p: LatLngLiteral) {
  return { location: { latLng: { latitude: p.lat, longitude: p.lng } } };
}

function parseSeconds(d: string | undefined): number {
  if (!d) return 0;
  return parseInt(d.replace(/s$/, ""), 10) || 0;
}

export async function computeRoute(
  points: RouteWaypoint[],
  apiKey: string | undefined = process.env.GOOGLE_MAPS_SERVER_KEY,
  opts: { optimize?: boolean; legPolylines?: boolean } = {},
): Promise<ComputedRoute> {
  if (!apiKey) throw new RouteError("Missing GOOGLE_MAPS_SERVER_KEY");
  if (points.length < 2) throw new RouteError("A route needs at least two points");

  const [origin, ...rest] = points;
  const destination = rest[rest.length - 1];
  const intermediates = rest.slice(0, -1);

  const res = await fetch(ROUTES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": [
        "routes.duration",
        "routes.distanceMeters",
        "routes.polyline.encodedPolyline",
        "routes.legs.duration",
        "routes.legs.distanceMeters",
        ...(opts.optimize ? ["routes.optimizedIntermediateWaypointIndex"] : []),
        ...(opts.legPolylines ? ["routes.legs.polyline.encodedPolyline"] : []),
      ].join(","),
    },
    body: JSON.stringify({
      origin: toWaypoint(origin),
      destination: toWaypoint(destination),
      intermediates: intermediates.map((p) =>
        p.via ? { ...toWaypoint(p), via: true } : toWaypoint(p),
      ),
      travelMode: "DRIVE",
      units: "METRIC",
      ...(opts.optimize ? { optimizeWaypointOrder: true } : {}),
    }),
  });

  if (!res.ok) throw new RouteError(`Routes request failed (HTTP ${res.status})`);

  const data = (await res.json()) as {
    routes?: Array<{
      duration?: string;
      distanceMeters?: number;
      polyline?: { encodedPolyline?: string };
      legs?: Array<{
        duration?: string;
        distanceMeters?: number;
        polyline?: { encodedPolyline?: string };
      }>;
      optimizedIntermediateWaypointIndex?: number[];
    }>;
  };

  const route = data.routes?.[0];
  if (!route || !route.polyline?.encodedPolyline) {
    throw new RouteError("No route returned");
  }

  return {
    encodedPolyline: route.polyline.encodedPolyline,
    legs: (route.legs ?? []).map((l) => ({
      durationSeconds: parseSeconds(l.duration),
      distanceMeters: l.distanceMeters ?? 0,
      encodedPolyline: l.polyline?.encodedPolyline,
    })),
    totalDurationSeconds: parseSeconds(route.duration),
    totalDistanceMeters: route.distanceMeters ?? 0,
    optimizedOrder: route.optimizedIntermediateWaypointIndex,
  };
}

/** Split a waypoint chain so each batch has <= maxIntermediates intermediates,
 *  cutting only on stopover (non-via) boundaries and SHARING the boundary waypoint
 *  with the next batch (so the concatenated legs equal the whole chain's legs). */
export function chunkWaypoints(points: RouteWaypoint[], maxIntermediates = 25): RouteWaypoint[][] {
  if (points.length <= maxIntermediates + 2) return [points];
  const batches: RouteWaypoint[][] = [];
  let start = 0;
  while (start < points.length - 1) {
    const end = Math.min(start + maxIntermediates + 1, points.length - 1);
    let cut = end;
    // The final destination is always a valid batch end; otherwise back up so the
    // batch ends on a stopover (not a via pass-through) shared with the next batch.
    if (cut < points.length - 1) {
      while (cut > start + 1 && points[cut].via) cut--;
    }
    batches.push(points.slice(start, cut + 1));
    start = cut; // share the boundary waypoint
  }
  return batches;
}

/** Compute a (possibly long) segment by chunking into <=25-intermediate batches
 *  and concatenating their legs in order. */
export async function computeRouteChunked(
  points: RouteWaypoint[],
  apiKey: string | undefined = process.env.GOOGLE_MAPS_SERVER_KEY,
  opts: { legPolylines?: boolean; maxIntermediates?: number } = {},
): Promise<RouteLeg[]> {
  const batches = chunkWaypoints(points, opts.maxIntermediates);
  const legs: RouteLeg[] = [];
  for (const batch of batches) {
    const r = await computeRoute(batch, apiKey, opts);
    legs.push(...r.legs);
  }
  return legs;
}
