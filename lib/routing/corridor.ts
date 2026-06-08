import type { LatLngLiteral } from "@/lib/routing/routes";

export function haversineMeters(a: LatLngLiteral, b: LatLngLiteral): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Order stops along the start→end corridor by projecting each onto the start→end
 * vector. For a round trip (start ≈ end) the projection is undefined, so fall back
 * to a nearest-neighbor chain starting from `start`.
 */
export function orderByCorridor<T extends LatLngLiteral>(
  stops: T[],
  start: LatLngLiteral,
  end: LatLngLiteral,
): T[] {
  const vLat = end.lat - start.lat;
  const vLng = end.lng - start.lng;
  const vLen2 = vLat * vLat + vLng * vLng;

  if (vLen2 > 1e-9) {
    const projection = (p: LatLngLiteral): number =>
      ((p.lat - start.lat) * vLat + (p.lng - start.lng) * vLng) / vLen2;
    return [...stops].sort((p, q) => projection(p) - projection(q));
  }

  // Round-trip fallback: nearest-neighbor chain from start.
  const remaining = [...stops];
  const ordered: T[] = [];
  let cursor: LatLngLiteral = start;
  while (remaining.length) {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = haversineMeters(cursor, remaining[i]);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    const [next] = remaining.splice(bestIdx, 1);
    ordered.push(next);
    cursor = next;
  }
  return ordered;
}
