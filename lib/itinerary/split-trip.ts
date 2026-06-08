import type { PrismaClient } from "@/lib/generated/prisma/client";
import { computeRoute, type ComputedRoute } from "@/lib/routing/routes";
import { orderByCorridor } from "@/lib/routing/corridor";
import { splitByDriveCap, DEFAULT_DAILY_DRIVE_MAX_SECONDS } from "@/lib/routing/split";

type ComputeRouteFn = (
  points: { lat: number; lng: number }[],
  apiKey?: string,
  opts?: { optimize?: boolean },
) => Promise<ComputedRoute>;

function dailyCapFromParams(params: string | null): number {
  if (!params) return DEFAULT_DAILY_DRIVE_MAX_SECONDS;
  try {
    const parsed = JSON.parse(params) as { dailyDriveMaxSeconds?: number };
    return typeof parsed.dailyDriveMaxSeconds === "number" && parsed.dailyDriveMaxSeconds > 0
      ? parsed.dailyDriveMaxSeconds
      : DEFAULT_DAILY_DRIVE_MAX_SECONDS;
  } catch {
    return DEFAULT_DAILY_DRIVE_MAX_SECONDS;
  }
}

/**
 * Split the unassigned pool across the trip's days (corridor order + drive cap).
 * Existing day placements are kept; each pool stop is appended to the end of its
 * assigned day. `capOverride` is mainly for tests.
 */
export async function splitPoolIntoDays(
  prisma: PrismaClient,
  tripId: string,
  computeFn: ComputeRouteFn = computeRoute,
  capOverride?: number,
) {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: { days: { orderBy: { dayIndex: "asc" } }, pois: true },
  });
  if (!trip || trip.days.length === 0) return;

  const pool = trip.pois.filter((p) => p.dayId === null);
  if (pool.length === 0) return;

  const start = { lat: trip.startLat, lng: trip.startLng };
  const end =
    trip.endLat != null && trip.endLng != null
      ? { lat: trip.endLat, lng: trip.endLng }
      : start;

  const ordered = orderByCorridor(
    pool.map((p) => ({ id: p.id, lat: p.lat, lng: p.lng })),
    start,
    end,
  );

  const route = await computeFn([start, ...ordered.map((s) => ({ lat: s.lat, lng: s.lng })), end]);
  const legSeconds = ordered.map((_, i) => route.legs[i]?.durationSeconds ?? 0);

  const cap = capOverride ?? dailyCapFromParams(trip.params);
  const dayAssignment = splitByDriveCap(legSeconds, trip.days.length, cap);

  const newByDay = new Map<number, string[]>();
  ordered.forEach((s, i) => {
    const d = dayAssignment[i];
    const list = newByDay.get(d) ?? [];
    list.push(s.id);
    newByDay.set(d, list);
  });

  await prisma.$transaction(async (tx) => {
    for (let d = 0; d < trip.days.length; d++) {
      const newIds = newByDay.get(d) ?? [];
      if (newIds.length === 0) continue;
      const day = trip.days[d];
      const existing = trip.pois
        .filter((p) => p.dayId === day.id)
        .sort((a, b) => (a.orderInDay ?? 0) - (b.orderInDay ?? 0))
        .map((p) => p.id);
      const finalIds = [...existing, ...newIds];
      for (let i = 0; i < finalIds.length; i++) {
        await tx.poi.update({ where: { id: finalIds[i] }, data: { dayId: day.id, orderInDay: i } });
      }
    }
  });
}

/**
 * Rebuild the whole trip from scratch: treat every stop as input, order by
 * corridor, split across days by the cap. The route is computed BEFORE any DB write, so a Routes API failure
 * leaves the trip untouched; the reset + re-assignment happen in one transaction.
 */
export async function resplitAll(
  prisma: PrismaClient,
  tripId: string,
  computeFn: ComputeRouteFn = computeRoute,
  capOverride?: number,
) {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: { days: { orderBy: { dayIndex: "asc" } }, pois: true },
  });
  if (!trip || trip.days.length === 0 || trip.pois.length === 0) return;

  const start = { lat: trip.startLat, lng: trip.startLng };
  const end =
    trip.endLat != null && trip.endLng != null
      ? { lat: trip.endLat, lng: trip.endLng }
      : start;

  const ordered = orderByCorridor(
    trip.pois.map((p) => ({ id: p.id, lat: p.lat, lng: p.lng })),
    start,
    end,
  );

  // Compute the route first — if this throws, nothing below runs and the DB is unchanged.
  const route = await computeFn([start, ...ordered.map((s) => ({ lat: s.lat, lng: s.lng })), end]);
  const legSeconds = ordered.map((_, i) => route.legs[i]?.durationSeconds ?? 0);
  const cap = capOverride ?? dailyCapFromParams(trip.params);
  const dayAssignment = splitByDriveCap(legSeconds, trip.days.length, cap);

  const byDay = new Map<number, string[]>();
  ordered.forEach((s, i) => {
    const d = dayAssignment[i];
    const list = byDay.get(d) ?? [];
    list.push(s.id);
    byDay.set(d, list);
  });

  await prisma.$transaction(async (tx) => {
    await tx.poi.updateMany({
      where: { tripId },
      data: { dayId: null, orderInDay: null },
    });
    for (let d = 0; d < trip.days.length; d++) {
      const ids = byDay.get(d) ?? [];
      for (let i = 0; i < ids.length; i++) {
        await tx.poi.update({ where: { id: ids[i] }, data: { dayId: trip.days[d].id, orderInDay: i } });
      }
    }
  });
}
