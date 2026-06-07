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
