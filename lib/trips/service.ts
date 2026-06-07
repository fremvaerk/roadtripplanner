import type { PrismaClient } from "@/lib/generated/prisma/client";
import type { CreateTripData, UpdateTripInput } from "@/lib/trips/schema";

export async function createTrip(prisma: PrismaClient, data: CreateTripData) {
  return prisma.trip.create({
    data: {
      title: data.title,
      description: data.description,
      isRoundTrip: data.isRoundTrip,
      startDate: data.startDate,
      startName: data.start.name,
      startLat: data.start.lat,
      startLng: data.start.lng,
      startPlaceId: data.start.placeId,
      endName: data.end?.name ?? null,
      endLat: data.end?.lat ?? null,
      endLng: data.end?.lng ?? null,
      endPlaceId: data.end?.placeId ?? null,
      days: {
        create: Array.from({ length: data.dayCount }, (_, i) => ({ dayIndex: i })),
      },
    },
    include: {
      days: { orderBy: { dayIndex: "asc" } },
      pois: true,
    },
  });
}

export async function getTrip(prisma: PrismaClient, id: string) {
  return prisma.trip.findUnique({
    where: { id },
    include: {
      days: {
        orderBy: { dayIndex: "asc" },
        include: { pois: { orderBy: { orderInDay: "asc" } } },
      },
      pois: { orderBy: { createdAt: "asc" } },
    },
  });
}

export async function listTrips(prisma: PrismaClient) {
  return prisma.trip.findMany({ orderBy: { updatedAt: "desc" } });
}

export async function updateTrip(
  prisma: PrismaClient,
  id: string,
  patch: UpdateTripInput,
) {
  return prisma.trip.update({ where: { id }, data: patch });
}

export async function deleteTrip(prisma: PrismaClient, id: string) {
  return prisma.trip.delete({ where: { id } });
}
