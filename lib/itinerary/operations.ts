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
