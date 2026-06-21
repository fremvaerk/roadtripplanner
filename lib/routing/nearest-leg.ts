export type LatLng = { lat: number; lng: number };
export type LegPath = { afterPoiId: string | null; dayId: string | null; coords: LatLng[] };

const R = 6_371_000; // earth radius (m)
const toRad = (d: number) => (d * Math.PI) / 180;

/** Project to local planar metres around `ref` (equirectangular; accurate at trip scale). */
function toXY(p: LatLng, ref: LatLng): { x: number; y: number } {
  return {
    x: (toRad(p.lng) - toRad(ref.lng)) * Math.cos(toRad(ref.lat)) * R,
    y: (toRad(p.lat) - toRad(ref.lat)) * R,
  };
}

function distToSegment(p: LatLng, a: LatLng, b: LatLng): number {
  const P = toXY(p, p);
  const A = toXY(a, p);
  const B = toXY(b, p);
  const dx = B.x - A.x;
  const dy = B.y - A.y;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq === 0 ? 0 : ((P.x - A.x) * dx + (P.y - A.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = A.x + t * dx;
  const cy = A.y + t * dy;
  return Math.hypot(P.x - cx, P.y - cy);
}

function distToPath(p: LatLng, coords: LatLng[]): number {
  if (coords.length === 0) return Infinity;
  if (coords.length === 1) return distToSegment(p, coords[0], coords[0]);
  let min = Infinity;
  for (let i = 0; i < coords.length - 1; i++) {
    const d = distToSegment(p, coords[i], coords[i + 1]);
    if (d < min) min = d;
  }
  return min;
}

/** The leg whose polyline runs closest to `point`, or null if there are no legs. */
export function nearestLeg(legs: LegPath[], point: LatLng): LegPath | null {
  let best: LegPath | null = null;
  let bestDist = Infinity;
  for (const leg of legs) {
    const d = distToPath(point, leg.coords);
    if (d < bestDist) {
      bestDist = d;
      best = leg;
    }
  }
  return best;
}
