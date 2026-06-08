const ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";

export class RouteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RouteError";
  }
}

export type LatLngLiteral = { lat: number; lng: number };
export type RouteLeg = { durationSeconds: number; distanceMeters: number };
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
  points: LatLngLiteral[],
  apiKey: string | undefined = process.env.GOOGLE_MAPS_SERVER_KEY,
  opts: { optimize?: boolean } = {},
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
      ].join(","),
    },
    body: JSON.stringify({
      origin: toWaypoint(origin),
      destination: toWaypoint(destination),
      intermediates: intermediates.map(toWaypoint),
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
      legs?: Array<{ duration?: string; distanceMeters?: number }>;
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
    })),
    totalDurationSeconds: parseSeconds(route.duration),
    totalDistanceMeters: route.distanceMeters ?? 0,
    optimizedOrder: route.optimizedIntermediateWaypointIndex,
  };
}
