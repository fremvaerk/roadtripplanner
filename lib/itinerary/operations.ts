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
  source?: "user" | "search" | "map" | "ai";
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
  if (input.groupId) {
    const group = await prisma.poiGroup.findFirst({
      where: { id: input.groupId, tripId },
    });
    if (!group) throw new ItineraryError("Group does not belong to this trip");
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
      for (let i = 0; i < ids.length; i++) {
        await tx.poi.update({ where: { id: ids[i] }, data: { dayId, orderInDay: i } });
      }
    } else {
      await tx.poi.update({
        where: { id: poiId },
        data: { dayId: null, orderInDay: null },
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

  const destination = stops[stops.length - 1];
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

export async function createGroup(prisma: PrismaClient, tripId: string, name: string) {
  const orderIndex = await prisma.poiGroup.count({ where: { tripId } });
  return prisma.poiGroup.create({ data: { tripId, name, orderIndex } });
}

export async function renameGroup(prisma: PrismaClient, groupId: string, name: string) {
  return prisma.poiGroup.update({ where: { id: groupId }, data: { name } });
}

export async function deleteGroup(prisma: PrismaClient, groupId: string) {
  return prisma.$transaction(async (tx) => {
    const group = await tx.poiGroup.findUnique({ where: { id: groupId } });
    if (!group) throw new ItineraryError("Group not found");
    // Append this group's POIs to the end of the ungrouped bucket so their
    // orderInGroup doesn't collide with existing ungrouped POIs.
    const ungroupedCount = await tx.poi.count({
      where: { tripId: group.tripId, groupId: null },
    });
    const moving = await tx.poi.findMany({
      where: { groupId },
      orderBy: { orderInGroup: "asc" },
      select: { id: true },
    });
    for (let i = 0; i < moving.length; i++) {
      await tx.poi.update({
        where: { id: moving[i].id },
        data: { groupId: null, orderInGroup: ungroupedCount + i },
      });
    }
    return tx.poiGroup.delete({ where: { id: groupId } });
  });
}

export async function reorderGroups(
  prisma: PrismaClient,
  tripId: string,
  orderedIds: string[],
) {
  return prisma.$transaction(async (tx) => {
    // Phase 1 parks indices above any existing value to avoid the
    // @@unique([tripId, orderIndex]) collision; offset by length so it's
    // collision-free for any group count.
    const offset = orderedIds.length;
    for (let i = 0; i < orderedIds.length; i++) {
      await tx.poiGroup.update({ where: { id: orderedIds[i] }, data: { orderIndex: offset + i } });
    }
    for (let i = 0; i < orderedIds.length; i++) {
      await tx.poiGroup.update({ where: { id: orderedIds[i] }, data: { orderIndex: i } });
    }
  });
}

export async function moveToGroup(
  prisma: PrismaClient,
  poiId: string,
  groupId: string | null,
  orderInGroup: number,
) {
  return prisma.$transaction(async (tx) => {
    const poi = await tx.poi.findUnique({ where: { id: poiId } });
    if (!poi) throw new ItineraryError("POI not found");
    const oldGroupId = poi.groupId;

    if (groupId) {
      const group = await tx.poiGroup.findFirst({ where: { id: groupId, tripId: poi.tripId } });
      if (!group) throw new ItineraryError("Group does not belong to this trip");
    }

    const siblings = await tx.poi.findMany({
      where: { tripId: poi.tripId, groupId, id: { not: poiId } },
      orderBy: { orderInGroup: "asc" },
      select: { id: true },
    });
    const ids = siblings.map((s) => s.id);
    const index = Math.max(0, Math.min(orderInGroup, ids.length));
    ids.splice(index, 0, poiId);
    for (let i = 0; i < ids.length; i++) {
      await tx.poi.update({ where: { id: ids[i] }, data: { groupId, orderInGroup: i } });
    }

    if (oldGroupId !== groupId) {
      const src = await tx.poi.findMany({
        where: { tripId: poi.tripId, groupId: oldGroupId },
        orderBy: { orderInGroup: "asc" },
        select: { id: true },
      });
      for (let i = 0; i < src.length; i++) {
        await tx.poi.update({ where: { id: src[i].id }, data: { orderInGroup: i } });
      }
    }

    return tx.poi.findUnique({ where: { id: poiId } });
  });
}

export async function addVia(
  prisma: PrismaClient,
  tripId: string,
  input: { afterPoiId: string | null; lat: number; lng: number },
) {
  if (input.afterPoiId) {
    const stop = await prisma.poi.findFirst({ where: { id: input.afterPoiId, tripId } });
    if (!stop) throw new ItineraryError("Anchor stop does not belong to this trip");
  }
  // max(seq)+1 (not count) so seq stays gap-safe/unique after a delete-then-add.
  const last = await prisma.routeVia.findFirst({
    where: { tripId, afterPoiId: input.afterPoiId ?? null },
    orderBy: { seq: "desc" },
    select: { seq: true },
  });
  const seq = last ? last.seq + 1 : 0;
  return prisma.routeVia.create({
    data: { tripId, afterPoiId: input.afterPoiId ?? null, lat: input.lat, lng: input.lng, seq },
  });
}

export async function moveVia(
  prisma: PrismaClient,
  viaId: string,
  input: { lat: number; lng: number },
) {
  return prisma.routeVia.update({ where: { id: viaId }, data: { lat: input.lat, lng: input.lng } });
}

export async function removeVia(prisma: PrismaClient, viaId: string) {
  return prisma.routeVia.delete({ where: { id: viaId } });
}

export async function setNight(
  prisma: PrismaClient,
  dayId: string,
  input: { lat: number; lng: number; title?: string | null; url?: string | null; notes?: string | null },
) {
  return prisma.nightStop.upsert({
    where: { dayId },
    create: {
      dayId,
      lat: input.lat,
      lng: input.lng,
      title: input.title ?? null,
      url: input.url ?? null,
      notes: input.notes ?? null,
    },
    update: {
      lat: input.lat,
      lng: input.lng,
      title: input.title ?? null,
      url: input.url ?? null,
      notes: input.notes ?? null,
    },
  });
}

export async function updateNight(
  prisma: PrismaClient,
  dayId: string,
  patch: { lat?: number; lng?: number; title?: string | null; url?: string | null; notes?: string | null },
) {
  const existing = await prisma.nightStop.findUnique({ where: { dayId } });
  if (!existing) throw new ItineraryError("This day has no night stop");
  return prisma.nightStop.update({ where: { dayId }, data: patch });
}

export async function clearNight(prisma: PrismaClient, dayId: string) {
  return prisma.nightStop.deleteMany({ where: { dayId } });
}

export async function addDay(prisma: PrismaClient, tripId: string) {
  const dayIndex = await prisma.day.count({ where: { tripId } });
  return prisma.day.create({ data: { tripId, dayIndex } });
}

export async function removeDay(prisma: PrismaClient, dayId: string) {
  return prisma.$transaction(async (tx) => {
    const day = await tx.day.findUnique({ where: { id: dayId } });
    if (!day) throw new ItineraryError("Day not found");
    await tx.poi.updateMany({ where: { dayId }, data: { dayId: null, orderInDay: null } });
    await tx.day.delete({ where: { id: dayId } });
    const remaining = await tx.day.findMany({
      where: { tripId: day.tripId },
      orderBy: { dayIndex: "asc" },
    });
    for (let i = 0; i < remaining.length; i++) {
      if (remaining[i].dayIndex !== i) {
        await tx.day.update({ where: { id: remaining[i].id }, data: { dayIndex: i } });
      }
    }
  });
}
