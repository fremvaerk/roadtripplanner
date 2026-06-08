import type { AddPoiBody } from "@/lib/itinerary/schema";

export type PoiDetail = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  placeId: string | null;
  category: string | null;
  source: string;
  isOvernight: boolean;
  dayId: string | null;
  orderInDay: number | null;
  status: string;
};

export type DayDetail = {
  id: string;
  dayIndex: number;
  pois: PoiDetail[];
};

export type TripDetail = {
  id: string;
  title: string;
  description: string;
  startName: string;
  startLat: number;
  startLng: number;
  endName: string | null;
  endLat: number | null;
  endLng: number | null;
  isRoundTrip: boolean;
  days: DayDetail[];
  pois: PoiDetail[];
};

export async function fetchTrip(tripId: string): Promise<TripDetail> {
  const res = await fetch(`/api/trips/${tripId}`);
  if (!res.ok) throw new Error(`Failed to load trip (${res.status})`);
  return res.json();
}

export async function postPoi(tripId: string, body: AddPoiBody): Promise<PoiDetail> {
  const res = await fetch(`/api/trips/${tripId}/pois`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Failed to add place (${res.status})`);
  return res.json();
}

export async function deletePoi(poiId: string): Promise<void> {
  const res = await fetch(`/api/pois/${poiId}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Failed to remove place (${res.status})`);
}

export async function patchPoiMove(
  poiId: string,
  dayId: string | null,
  orderInDay: number,
): Promise<PoiDetail> {
  const res = await fetch(`/api/pois/${poiId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ op: "move", dayId, orderInDay }),
  });
  if (!res.ok) throw new Error(`Failed to move place (${res.status})`);
  return res.json();
}

export async function patchPoiOvernight(
  poiId: string,
  isOvernight: boolean,
): Promise<PoiDetail> {
  const res = await fetch(`/api/pois/${poiId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ op: "overnight", isOvernight }),
  });
  if (!res.ok) throw new Error(`Failed to set overnight (${res.status})`);
  return res.json();
}

export type RouteResult = {
  encodedPolyline: string | null;
  perDaySeconds: Record<string, number>;
  totalSeconds: number;
  totalMeters: number;
};

export async function fetchRoute(tripId: string): Promise<RouteResult> {
  const res = await fetch(`/api/trips/${tripId}/route`);
  if (!res.ok) throw new Error(`Failed to load route (${res.status})`);
  return res.json();
}

export async function optimizeDayRequest(dayId: string): Promise<void> {
  const res = await fetch(`/api/days/${dayId}/optimize`, { method: "POST" });
  if (!res.ok) throw new Error(`Failed to optimize day (${res.status})`);
}

export async function buildSplitRequest(tripId: string): Promise<void> {
  const res = await fetch(`/api/trips/${tripId}/split`, { method: "POST" });
  if (!res.ok) throw new Error(`Failed to split into days (${res.status})`);
}

export async function resplitRequest(tripId: string): Promise<void> {
  const res = await fetch(`/api/trips/${tripId}/resplit`, { method: "POST" });
  if (!res.ok) throw new Error(`Failed to re-split (${res.status})`);
}
