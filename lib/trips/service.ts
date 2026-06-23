import type { PrismaClient } from "@/lib/generated/prisma/client";
import { Prisma } from "@/lib/generated/prisma/client";
import type { CreateTripData } from "@/lib/trips/schema";
import type { Session } from "@/lib/auth/session";
import { effectiveRole, type Role } from "@/lib/auth/access";
import { requireWrite, requireOwner } from "@/lib/auth/guards";

export async function createTrip(prisma: PrismaClient, data: CreateTripData, userId?: string | null) {
  const end = data.finish?.mode === "place" ? data.finish.place : null;
  return prisma.trip.create({
    data: {
      userId: userId ?? undefined,
      title: data.title,
      description: data.description,
      isRoundTrip: data.finish?.mode === "round",
      coverImage: data.coverImage ?? null,
      startDate: data.startDate,
      startName: data.start.name,
      startLat: data.start.lat,
      startLng: data.start.lng,
      startPlaceId: data.start.placeId,
      endName: end?.name ?? null,
      endLat: end?.lat ?? null,
      endLng: end?.lng ?? null,
      endPlaceId: end?.placeId ?? null,
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

export async function getTrip(prisma: PrismaClient, id: string, session: Session) {
  const role = await effectiveRole(prisma, session, id);
  if (!role) return null;
  const trip = await prisma.trip.findUnique({
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
  if (!trip) return null;
  return { ...trip, role };
}

export async function listTrips(prisma: PrismaClient, session: Session) {
  const email = session.email.toLowerCase();
  const trips = await prisma.trip.findMany({
    where: {
      OR: [{ userId: session.userId }, { shares: { some: { email } } }],
    },
    orderBy: { updatedAt: "desc" },
    include: {
      shares: { where: { email }, select: { role: true } },
      _count: { select: { days: true, pois: true } },
      // One representative photo for the list cover (places enrich lazily, so
      // many trips have none — the card falls back to a placeholder).
      pois: {
        where: { imageUrl: { not: null } },
        select: { imageUrl: true },
        take: 1,
        orderBy: { createdAt: "asc" },
      },
    },
  });
  return trips.map(({ shares, pois, _count, ...t }) => {
    const role: Role =
      t.userId === session.userId
        ? "owner"
        : ((shares[0]?.role as Role) ?? "viewer");
    return {
      ...t,
      role,
      coverImage: t.coverImage ?? pois[0]?.imageUrl ?? null,
      dayCount: _count.days,
      poiCount: _count.pois,
    };
  });
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
    archived?: boolean;
    coverImage?: string | null;
  },
  session: Session,
) {
  await requireWrite(prisma, session, id);
  const data: Prisma.TripUpdateInput = {};
  if (patch.title !== undefined) data.title = patch.title;
  if (patch.description !== undefined) data.description = patch.description;
  if (patch.coverImage !== undefined) data.coverImage = patch.coverImage;
  if (patch.startDate !== undefined) data.startDate = patch.startDate;
  if (patch.archived !== undefined) {
    data.archivedAt = patch.archived ? new Date() : null;
  }
  if (patch.start) {
    data.startName = patch.start.name;
    data.startLat = patch.start.lat;
    data.startLng = patch.start.lng;
    data.startPlaceId = patch.start.placeId;
  }
  if (patch.finish) {
    if (patch.finish.mode === "place") {
      const p = patch.finish.place;
      if (!p) throw new Error("finish.place is required for mode 'place'");
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

export async function deleteTrip(prisma: PrismaClient, id: string, session: Session) {
  await requireOwner(prisma, session, id);
  return prisma.trip.delete({ where: { id } });
}
