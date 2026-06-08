import type { PrismaClient } from "@/lib/generated/prisma/client";
import { computeRoute, type ComputedRoute } from "@/lib/routing/routes";
import { applyOptimizedOrder } from "@/lib/routing/optimize";

/** Thrown when an operation is given input that's invalid for the target trip. */
export class ItineraryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ItineraryError";
  }
}

export type AddPoiInput = {
  name: string;
  lat: number;
  lng: number;
  placeId?: string | null;
  category?: string | null;
  source?: string; // "user" | "search" | "map" | "ai"
  dayId?: string | null;
  groupId?: string | null;
};

export async function addPoi(
  prisma: PrismaClient,
  tripId: string,
  input: AddPoiInput,
) {
  let orderInDay: number | null = null;
  if (input.dayId) {
    // Ensure the target day belongs to this trip (the FK alone only proves the
    // day exists, not that it's the same trip).
    const day = await prisma.day.findFirst({
      where: { id: input.dayId, tripId },
    });
    if (!day) throw new ItineraryError("Day does not belong to this trip");
    orderInDay = await prisma.poi.count({ where: { dayId: input.dayId } });
  }
  const orderInGroup = await prisma.poi.count({
    where: { tripId, groupId: input.groupId ?? null },
  });
  return prisma.poi.create({
    data: {
      tripId,
      dayId: input.dayId ?? null,
      orderInDay,
      groupId: input.groupId ?? null,
      orderInGroup,
      name: input.name,
      lat: input.lat,
      lng: input.lng,
      placeId: input.placeId ?? null,
      category: input.category ?? null,
      source: input.source ?? "user",
      status: "accepted",
    },
  });
}

export async function removePoi(prisma: PrismaClient, poiId: string) {
  return prisma.poi.delete({ where: { id: poiId } });
}

export async function movePoi(
  prisma: PrismaClient,
  poiId: string,
  target: { dayId: string | null; orderInDay: number },
) {
  return prisma.$transaction(async (tx) => {
    const poi = await tx.poi.findUnique({ where: { id: poiId } });
    if (!poi) throw new ItineraryError("POI not found");
    const oldDayId = poi.dayId;
    const { dayId } = target;

    if (dayId) {
      const day = await tx.day.findFirst({ where: { id: dayId, tripId: poi.tripId } });
      if (!day) throw new ItineraryError("Day does not belong to this trip");
      const siblings = await tx.poi.findMany({
        where: { dayId, id: { not: poiId } },
        orderBy: { orderInDay: "asc" },
        select: { id: true },
      });
      const ids = siblings.map((s) => s.id);
      const index = Math.max(0, Math.min(target.orderInDay, ids.length));
      ids.splice(index, 0, poiId);
      const changedDay = oldDayId !== dayId;
      for (let i = 0; i < ids.length; i++) {
        // Moving to a different day drops the overnight flag (overnight is per-day);
        // a same-day reorder keeps it.
        const data =
          ids[i] === poiId && changedDay
            ? { dayId, orderInDay: i, isOvernight: false }
            : { dayId, orderInDay: i };
        await tx.poi.update({ where: { id: ids[i] }, data });
      }
    } else {
      await tx.poi.update({
        where: { id: poiId },
        data: { dayId: null, orderInDay: null, isOvernight: false },
      });
    }

    if (oldDayId && oldDayId !== dayId) {
      const src = await tx.poi.findMany({
        where: { dayId: oldDayId },
        orderBy: { orderInDay: "asc" },
        select: { id: true },
      });
      for (let i = 0; i < src.length; i++) {
        await tx.poi.update({ where: { id: src[i].id }, data: { orderInDay: i } });
      }
    }

    return tx.poi.findUnique({ where: { id: poiId } });
  });
}

type ComputeRouteFn = (
  points: { lat: number; lng: number }[],
  apiKey?: string,
  opts?: { optimize?: boolean },
) => Promise<ComputedRoute>;

export async function optimizeDay(
  prisma: PrismaClient,
  dayId: string,
  computeFn: ComputeRouteFn = computeRoute,
) {
  const stops = await prisma.poi.findMany({
    where: { dayId },
    orderBy: { orderInDay: "asc" },
  });
  if (stops.length < 3) return stops;

  const destination = stops.find((s) => s.isOvernight) ?? stops[stops.length - 1];
  const rest = stops.filter((s) => s.id !== destination.id);
  const origin = rest[0];
  const intermediates = rest.slice(1);
  if (intermediates.length < 1) return stops;

  const points = [origin, ...intermediates, destination].map((s) => ({ lat: s.lat, lng: s.lng }));
  const route = await computeFn(points, undefined, { optimize: true });

  const orderedIntermediates =
    route.optimizedOrder && route.optimizedOrder.length === intermediates.length
      ? applyOptimizedOrder(intermediates, route.optimizedOrder)
      : intermediates;

  const finalOrder = [origin, ...orderedIntermediates, destination];

  return prisma.$transaction(async (tx) => {
    for (let i = 0; i < finalOrder.length; i++) {
      await tx.poi.update({ where: { id: finalOrder[i].id }, data: { orderInDay: i } });
    }
    return tx.poi.findMany({ where: { dayId }, orderBy: { orderInDay: "asc" } });
  });
}

export async function setOvernight(
  prisma: PrismaClient,
  poiId: string,
  value: boolean,
) {
  return prisma.$transaction(async (tx) => {
    // Read inside the transaction so the day-membership check and the write are atomic.
    const poi = await tx.poi.findUnique({ where: { id: poiId } });
    if (!poi) throw new ItineraryError("POI not found");

    if (value) {
      if (!poi.dayId) {
        throw new ItineraryError("Only a place assigned to a day can be the overnight");
      }
      await tx.poi.updateMany({
        where: { dayId: poi.dayId, isOvernight: true },
        data: { isOvernight: false },
      });
      await tx.poi.update({ where: { id: poiId }, data: { isOvernight: true } });
    } else {
      await tx.poi.update({ where: { id: poiId }, data: { isOvernight: false } });
    }

    return tx.poi.findUnique({ where: { id: poiId } });
  });
}
