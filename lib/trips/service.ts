import type { PrismaClient } from "@/lib/generated/prisma/client";
import { Prisma } from "@/lib/generated/prisma/client";
import type { CreateTripData } from "@/lib/trips/schema";

export async function createTrip(prisma: PrismaClient, data: CreateTripData) {
  return prisma.trip.create({
    data: {
      title: data.title,
      description: data.description,
      isRoundTrip: false,
      startDate: data.startDate,
      startName: data.start.name,
      startLat: data.start.lat,
      startLng: data.start.lng,
      startPlaceId: data.start.placeId,
      endName: null,
      endLat: null,
      endLng: null,
      endPlaceId: null,
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
        include: { pois: { orderBy: { orderInDay: "asc" } }, night: true },
      },
      pois: { orderBy: { createdAt: "asc" } },
      poiGroups: { orderBy: { orderIndex: "asc" } },
      routeVias: true,
    },
  });
}

export async function listTrips(prisma: PrismaClient) {
  return prisma.trip.findMany({ orderBy: { updatedAt: "desc" } });
}

type TripPlace = { name: string; lat: number; lng: number; placeId: string | null };

export async function updateTrip(
  prisma: PrismaClient,
  id: string,
  patch: {
    title?: string;
    description?: string;
    startDate?: Date | null;
    start?: TripPlace;
    finish?: { mode: "open" | "round" | "place"; place?: TripPlace };
  },
) {
  const data: Prisma.TripUpdateInput = {};
  if (patch.title !== undefined) data.title = patch.title;
  if (patch.description !== undefined) data.description = patch.description;
  if (patch.startDate !== undefined) data.startDate = patch.startDate;
  if (patch.start) {
    data.startName = patch.start.name;
    data.startLat = patch.start.lat;
    data.startLng = patch.start.lng;
    data.startPlaceId = patch.start.placeId;
  }
  if (patch.finish) {
    if (patch.finish.mode === "place") {
      const p = patch.finish.place!;
      data.isRoundTrip = false;
      data.endName = p.name;
      data.endLat = p.lat;
      data.endLng = p.lng;
      data.endPlaceId = p.placeId;
    } else {
      data.isRoundTrip = patch.finish.mode === "round";
      data.endName = null;
      data.endLat = null;
      data.endLng = null;
      data.endPlaceId = null;
    }
  }
  return prisma.trip.update({ where: { id }, data });
}

export async function deleteTrip(prisma: PrismaClient, id: string) {
  return prisma.trip.delete({ where: { id } });
}
