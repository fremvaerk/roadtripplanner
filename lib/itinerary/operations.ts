import type { PrismaClient } from "@/lib/generated/prisma/client";

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
  return prisma.poi.create({
    data: {
      tripId,
      dayId: input.dayId ?? null,
      orderInDay,
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

export async function setOvernight(
  prisma: PrismaClient,
  poiId: string,
  value: boolean,
) {
  const poi = await prisma.poi.findUnique({ where: { id: poiId } });
  if (!poi) throw new ItineraryError("POI not found");

  if (value) {
    if (!poi.dayId) {
      throw new ItineraryError("Only a place assigned to a day can be the overnight");
    }
    await prisma.$transaction([
      prisma.poi.updateMany({
        where: { dayId: poi.dayId, isOvernight: true },
        data: { isOvernight: false },
      }),
      prisma.poi.update({ where: { id: poiId }, data: { isOvernight: true } }),
    ]);
  } else {
    await prisma.poi.update({ where: { id: poiId }, data: { isOvernight: false } });
  }

  return prisma.poi.findUnique({ where: { id: poiId } });
}
