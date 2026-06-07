import type { PrismaClient } from "@/lib/generated/prisma/client";

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
