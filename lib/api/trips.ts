import type { AddPoiBody } from "@/lib/itinerary/schema";

export type PoiDetail = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  placeId: string | null;
  category: string | null;
  source: string;
  dayId: string | null;
  orderInDay: number | null;
  status: string;
  groupId: string | null;
  orderInGroup: number | null;
};

export type TripGroup = { id: string; name: string; orderIndex: number };

export type TripVia = { id: string; afterPoiId: string | null; lat: number; lng: number; seq: number };

export type DayNight = { id: string; lat: number; lng: number; title: string | null; url: string | null; notes: string | null };

export type DayDetail = {
  id: string;
  dayIndex: number;
  pois: PoiDetail[];
  night: DayNight | null;
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
  startDate: string | null;
  days: DayDetail[];
  pois: PoiDetail[];
  poiGroups: TripGroup[];
  routeVias: TripVia[];
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

export type RouteLegResult = { encodedPolyline: string | null; afterPoiId: string | null };
export type RouteResult = {
  legs: RouteLegResult[];
  perDaySeconds: Record<string, number>;
  perDayMeters: Record<string, number>;
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

export async function createGroupRequest(tripId: string, name: string): Promise<TripGroup> {
  const res = await fetch(`/api/trips/${tripId}/groups`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error(`Failed to create group (${res.status})`);
  return res.json();
}

export async function renameGroupRequest(groupId: string, name: string): Promise<void> {
  const res = await fetch(`/api/groups/${groupId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error(`Failed to rename group (${res.status})`);
}

export async function deleteGroupRequest(groupId: string): Promise<void> {
  const res = await fetch(`/api/groups/${groupId}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Failed to delete group (${res.status})`);
}

export async function reorderGroupsRequest(tripId: string, orderedIds: string[]): Promise<void> {
  const res = await fetch(`/api/trips/${tripId}/groups`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ orderedIds }),
  });
  if (!res.ok) throw new Error(`Failed to reorder groups (${res.status})`);
}

export async function moveToGroupRequest(
  poiId: string,
  groupId: string | null,
  orderInGroup: number,
): Promise<void> {
  const res = await fetch(`/api/pois/${poiId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ op: "group", groupId, orderInGroup }),
  });
  if (!res.ok) throw new Error(`Failed to move to group (${res.status})`);
}

export async function addViaRequest(
  tripId: string,
  afterPoiId: string | null,
  lat: number,
  lng: number,
): Promise<void> {
  const res = await fetch(`/api/trips/${tripId}/vias`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ afterPoiId, lat, lng }),
  });
  if (!res.ok) throw new Error(`Failed to add via (${res.status})`);
}

export async function moveViaRequest(viaId: string, lat: number, lng: number): Promise<void> {
  const res = await fetch(`/api/vias/${viaId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ lat, lng }),
  });
  if (!res.ok) throw new Error(`Failed to move via (${res.status})`);
}

export async function removeViaRequest(viaId: string): Promise<void> {
  const res = await fetch(`/api/vias/${viaId}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Failed to remove via (${res.status})`);
}

export async function setNightRequest(
  dayId: string,
  body: { lat: number; lng: number; title?: string | null; url?: string | null; notes?: string | null },
): Promise<void> {
  const res = await fetch(`/api/days/${dayId}/night`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Failed to set night (${res.status})`);
}

export async function updateNightRequest(
  dayId: string,
  patch: { lat?: number; lng?: number; title?: string | null; url?: string | null; notes?: string | null },
): Promise<void> {
  const res = await fetch(`/api/days/${dayId}/night`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`Failed to update night (${res.status})`);
}

export async function clearNightRequest(dayId: string): Promise<void> {
  const res = await fetch(`/api/days/${dayId}/night`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Failed to clear night (${res.status})`);
}

export async function addDayRequest(tripId: string): Promise<void> {
  const res = await fetch(`/api/trips/${tripId}/days`, { method: "POST" });
  if (!res.ok) throw new Error(`Failed to add day (${res.status})`);
}

export async function removeDayRequest(dayId: string): Promise<void> {
  const res = await fetch(`/api/days/${dayId}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Failed to remove day (${res.status})`);
}

export async function setStartDateRequest(tripId: string, startDate: string | null): Promise<void> {
  const res = await fetch(`/api/trips/${tripId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ startDate }),
  });
  if (!res.ok) throw new Error(`Failed to set start date (${res.status})`);
}
