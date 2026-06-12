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
  address: string | null;
  description: string | null;
  imageUrl: string | null;
};

export type TripGroup = { id: string; name: string; orderIndex: number; color: string };

export type TripVia = { id: string; afterPoiId: string | null; lat: number; lng: number; seq: number };

export type DayNight = { id: string; lat: number; lng: number; title: string | null; url: string | null; notes: string | null };

export type DayDetail = {
  id: string;
  dayIndex: number;
  color: string | null;
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
  archivedAt: string | null;
  days: DayDetail[];
  pois: PoiDetail[];
  poiGroups: TripGroup[];
  routeVias: TripVia[];
  role?: "owner" | "editor" | "viewer";
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

export async function updatePoiRequest(
  poiId: string,
  patch: { name?: string; description?: string | null; imageUrl?: string | null; address?: string | null; placeId?: string | null },
): Promise<void> {
  const res = await fetch(`/api/pois/${poiId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ op: "edit", ...patch }),
  });
  if (!res.ok) throw new Error(`Failed to update place (${res.status})`);
}

export type RouteLegResult = {
  encodedPolyline: string | null;
  afterPoiId: string | null;
  dayId: string | null;
  durationSeconds: number;
  distanceMeters: number;
};
export type RouteResult = {
  legs: RouteLegResult[];
  perDaySeconds: Record<string, number>;
  perDayMeters: Record<string, number>;
  totalSeconds: number;
  totalMeters: number;
  failedDayIds: string[];
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

export async function setGroupColorRequest(groupId: string, color: string): Promise<void> {
  const res = await fetch(`/api/groups/${groupId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ color }),
  });
  if (!res.ok) throw new Error(`Failed to set group color (${res.status})`);
}

export async function setDayColorRequest(dayId: string, color: string): Promise<void> {
  const res = await fetch(`/api/days/${dayId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ color }),
  });
  if (!res.ok) throw new Error(`Failed to set day color (${res.status})`);
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

export async function insertDayAfterRequest(tripId: string, afterDayId: string): Promise<void> {
  const res = await fetch(`/api/trips/${tripId}/days`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ afterDayId }),
  });
  if (!res.ok) throw new Error(`Failed to insert day (${res.status})`);
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

export async function setTripTitleRequest(tripId: string, title: string): Promise<void> {
  const res = await fetch(`/api/trips/${tripId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title }),
  });
  if (!res.ok) throw new Error(`Failed to rename trip (${res.status})`);
}

export type TripPlaceInput = { name: string; lat: number; lng: number; placeId: string | null };
export type TripBasePatch = {
  start?: TripPlaceInput;
  finish?: { mode: "open" | "round" | "place"; place?: TripPlaceInput };
};

export async function setTripBaseRequest(tripId: string, patch: TripBasePatch): Promise<void> {
  const res = await fetch(`/api/trips/${tripId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`Failed to update trip (${res.status})`);
}

export async function archiveTripRequest(tripId: string, archived: boolean): Promise<void> {
  const res = await fetch(`/api/trips/${tripId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ archived }),
  });
  if (!res.ok) throw new Error(`Failed to ${archived ? "archive" : "restore"} trip (${res.status})`);
}

/**
 * Permanently delete a trip. Treats 404 as success: a trip removed from the
 * list page may already be gone (e.g. a concurrent delete), and the caller's
 * intent — "this trip should not exist" — is satisfied either way. Do not copy
 * this 404-tolerance into deletes where a missing resource is a real error.
 */
export async function deleteTripRequest(tripId: string): Promise<void> {
  const res = await fetch(`/api/trips/${tripId}`, { method: "DELETE" });
  if (!res.ok && res.status !== 404) {
    throw new Error(`Failed to remove trip (${res.status})`);
  }
}

export function exportTripUrl(id: string): string {
  return `/api/trips/${id}/export`;
}

export async function importTripRequest(data: unknown): Promise<{ id: string }> {
  const res = await fetch("/api/trips/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const msg = (await res.json().catch(() => ({}))).error;
    throw new Error(typeof msg === "string" ? msg : `Import failed (${res.status})`);
  }
  return res.json();
}

export type TripShareItem = { id: string; email: string; role: "viewer" | "editor" };

export async function fetchShares(tripId: string): Promise<TripShareItem[]> {
  const res = await fetch(`/api/trips/${tripId}/shares`);
  if (!res.ok) throw new Error(`Failed to load shares (${res.status})`);
  return res.json();
}

export async function addShareRequest(
  tripId: string,
  email: string,
  role: "viewer" | "editor",
): Promise<void> {
  const res = await fetch(`/api/trips/${tripId}/shares`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, role }),
  });
  if (!res.ok) throw new Error(`Failed to add share (${res.status})`);
}

export async function setShareRoleRequest(
  tripId: string,
  shareId: string,
  role: "viewer" | "editor",
): Promise<void> {
  const res = await fetch(`/api/trips/${tripId}/shares/${shareId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ role }),
  });
  if (!res.ok) throw new Error(`Failed to update share (${res.status})`);
}

export async function removeShareRequest(tripId: string, shareId: string): Promise<void> {
  const res = await fetch(`/api/trips/${tripId}/shares/${shareId}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Failed to remove share (${res.status})`);
}
