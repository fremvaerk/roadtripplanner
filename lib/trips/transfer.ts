import type { PrismaClient } from "@/lib/generated/prisma/client";
import { z } from "zod";

export const TRIP_EXPORT_FORMAT = "roadtripplanner.trip";
export const TRIP_EXPORT_VERSION = 1;

export type TripExport = {
  format: string;
  version: number;
  exportedAt: string;
  trip: {
    title: string;
    startName: string;
    startLat: number;
    startLng: number;
    startPlaceId: string | null;
    endName: string | null;
    endLat: number | null;
    endLng: number | null;
    endPlaceId: string | null;
    isRoundTrip: boolean;
    description: string;
    startDate: string | null;
    params: string | null;
  };
  groups: {
    id: string;
    name: string;
    color: string;
    orderIndex: number;
  }[];
  days: {
    id: string;
    dayIndex: number;
    color: string | null;
    date: string | null;
    notes: string | null;
  }[];
  pois: {
    id: string;
    dayId: string | null;
    orderInDay: number | null;
    name: string;
    lat: number;
    lng: number;
    placeId: string | null;
    category: string | null;
    source: string;
    status: string;
    groupId: string | null;
    orderInGroup: number | null;
    rating: number | null;
    imageUrl: string | null;
    address: string | null;
    description: string | null;
    openingHours: string | null;
    aiReason: string | null;
    userNote: string | null;
  }[];
  nights: {
    dayId: string;
    lat: number;
    lng: number;
    title: string | null;
    url: string | null;
    notes: string | null;
  }[];
  vias: {
    dayId: string | null;
    afterPoiId: string | null;
    lat: number;
    lng: number;
    seq: number;
  }[];
};

export async function loadTripGraph(prisma: PrismaClient, tripId: string) {
  return prisma.trip.findUnique({
    where: { id: tripId },
    include: {
      days: { include: { night: true } },
      pois: true,
      poiGroups: true,
      routeVias: true,
    },
  });
}

type TripGraph = NonNullable<Awaited<ReturnType<typeof loadTripGraph>>>;

export function serializeTrip(graph: TripGraph): TripExport {
  return {
    format: TRIP_EXPORT_FORMAT,
    version: TRIP_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    trip: {
      title: graph.title,
      startName: graph.startName,
      startLat: graph.startLat,
      startLng: graph.startLng,
      startPlaceId: graph.startPlaceId,
      endName: graph.endName,
      endLat: graph.endLat,
      endLng: graph.endLng,
      endPlaceId: graph.endPlaceId,
      isRoundTrip: graph.isRoundTrip,
      description: graph.description,
      startDate: graph.startDate ? graph.startDate.toISOString() : null,
      params: graph.params,
    },
    groups: graph.poiGroups.map((g) => ({
      id: g.id,
      name: g.name,
      color: g.color,
      orderIndex: g.orderIndex,
    })),
    days: graph.days.map((d) => ({
      id: d.id,
      dayIndex: d.dayIndex,
      color: d.color,
      date: d.date ? d.date.toISOString() : null,
      notes: d.notes,
    })),
    pois: graph.pois.map((p) => ({
      id: p.id,
      dayId: p.dayId,
      orderInDay: p.orderInDay,
      name: p.name,
      lat: p.lat,
      lng: p.lng,
      placeId: p.placeId,
      category: p.category,
      source: p.source,
      status: p.status,
      groupId: p.groupId,
      orderInGroup: p.orderInGroup,
      rating: p.rating,
      imageUrl: p.imageUrl,
      address: p.address,
      description: p.description,
      openingHours: p.openingHours,
      aiReason: p.aiReason,
      userNote: p.userNote,
    })),
    nights: graph.days
      .map((d) => d.night)
      .filter((n): n is NonNullable<typeof n> => n != null)
      .map((n) => ({
        dayId: n.dayId,
        lat: n.lat,
        lng: n.lng,
        title: n.title,
        url: n.url,
        notes: n.notes,
      })),
    vias: graph.routeVias.map((v) => ({
      dayId: v.dayId,
      afterPoiId: v.afterPoiId,
      lat: v.lat,
      lng: v.lng,
      seq: v.seq,
    })),
  };
}

const nullableString = z.string().nullable().optional().default(null);

export const tripImportSchema = z.object({
  format: z.literal(TRIP_EXPORT_FORMAT, {
    message: `format must be "${TRIP_EXPORT_FORMAT}"`,
  }),
  version: z.literal(TRIP_EXPORT_VERSION, {
    message: `version must be ${TRIP_EXPORT_VERSION}`,
  }),
  exportedAt: z.string().optional(),
  trip: z.object({
    title: z.string(),
    startName: z.string(),
    startLat: z.number().finite(),
    startLng: z.number().finite(),
    startPlaceId: nullableString,
    endName: nullableString,
    endLat: z.number().finite().nullable().optional().default(null),
    endLng: z.number().finite().nullable().optional().default(null),
    endPlaceId: nullableString,
    isRoundTrip: z.boolean().optional().default(false),
    description: z.string().default(""),
    startDate: z.string().datetime().nullable().optional().default(null),
    params: nullableString,
  }),
  groups: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        color: z.string(),
        orderIndex: z.number(),
      }),
    )
    .default([]),
  days: z
    .array(
      z.object({
        id: z.string(),
        dayIndex: z.number(),
        color: nullableString,
        date: z.string().datetime().nullable().optional().default(null),
        notes: nullableString,
      }),
    )
    .default([]),
  pois: z
    .array(
      z.object({
        id: z.string(),
        dayId: nullableString,
        orderInDay: z.number().nullable().optional().default(null),
        name: z.string(),
        lat: z.number().finite(),
        lng: z.number().finite(),
        placeId: nullableString,
        category: nullableString,
        source: z.string().optional().default("user"),
        status: z.string().optional().default("accepted"),
        groupId: nullableString,
        orderInGroup: z.number().nullable().optional().default(null),
        rating: z.number().nullable().optional().default(null),
        imageUrl: nullableString,
        address: nullableString,
        description: nullableString,
        openingHours: nullableString,
        aiReason: nullableString,
        userNote: nullableString,
      }),
    )
    .default([]),
  nights: z
    .array(
      z.object({
        dayId: z.string(),
        lat: z.number().finite(),
        lng: z.number().finite(),
        title: nullableString,
        url: nullableString,
        notes: nullableString,
      }),
    )
    .default([]),
  vias: z
    .array(
      z.object({
        dayId: nullableString,
        afterPoiId: nullableString,
        lat: z.number().finite(),
        lng: z.number().finite(),
        seq: z.number(),
      }),
    )
    .default([]),
});

export type TripImport = z.infer<typeof tripImportSchema>;

export async function importTrip(
  prisma: PrismaClient,
  data: unknown,
  userId: string,
): Promise<{ id: string }> {
  const parsed = tripImportSchema.parse(data);

  return prisma.$transaction(async (tx) => {
    const trip = await tx.trip.create({
      data: {
        userId,
        title: parsed.trip.title,
        startName: parsed.trip.startName,
        startLat: parsed.trip.startLat,
        startLng: parsed.trip.startLng,
        startPlaceId: parsed.trip.startPlaceId,
        endName: parsed.trip.endName,
        endLat: parsed.trip.endLat,
        endLng: parsed.trip.endLng,
        endPlaceId: parsed.trip.endPlaceId,
        isRoundTrip: parsed.trip.isRoundTrip,
        description: parsed.trip.description,
        startDate: parsed.trip.startDate ? new Date(parsed.trip.startDate) : null,
        params: parsed.trip.params,
        archivedAt: null,
      },
    });

    const dayIdMap = new Map<string, string>();
    // Create in dayIndex order so the @@unique([tripId, dayIndex]) constraint is
    // never tripped by an oddly-ordered export array.
    const sortedDays = [...parsed.days].sort((a, b) => a.dayIndex - b.dayIndex);
    for (const day of sortedDays) {
      const created = await tx.day.create({
        data: {
          tripId: trip.id,
          dayIndex: day.dayIndex,
          color: day.color,
          date: day.date ? new Date(day.date) : null,
          notes: day.notes,
        },
      });
      dayIdMap.set(day.id, created.id);
    }

    const groupIdMap = new Map<string, string>();
    for (const group of parsed.groups) {
      const created = await tx.poiGroup.create({
        data: {
          tripId: trip.id,
          name: group.name,
          color: group.color,
          orderIndex: group.orderIndex,
        },
      });
      groupIdMap.set(group.id, created.id);
    }

    const poiIdMap = new Map<string, string>();
    for (const poi of parsed.pois) {
      const created = await tx.poi.create({
        data: {
          tripId: trip.id,
          dayId: poi.dayId ? dayIdMap.get(poi.dayId) ?? null : null,
          groupId: poi.groupId ? groupIdMap.get(poi.groupId) ?? null : null,
          orderInDay: poi.orderInDay,
          name: poi.name,
          lat: poi.lat,
          lng: poi.lng,
          placeId: poi.placeId,
          category: poi.category,
          source: poi.source,
          status: poi.status,
          orderInGroup: poi.orderInGroup,
          rating: poi.rating,
          imageUrl: poi.imageUrl,
          address: poi.address,
          description: poi.description,
          openingHours: poi.openingHours,
          aiReason: poi.aiReason,
          userNote: poi.userNote,
        },
      });
      poiIdMap.set(poi.id, created.id);
    }

    for (const night of parsed.nights) {
      const newDayId = dayIdMap.get(night.dayId);
      if (newDayId) {
        await tx.nightStop.create({
          data: {
            dayId: newDayId,
            lat: night.lat,
            lng: night.lng,
            title: night.title,
            url: night.url,
            notes: night.notes,
          },
        });
      }
    }

    for (const via of parsed.vias) {
      await tx.routeVia.create({
        data: {
          tripId: trip.id,
          dayId: via.dayId ? dayIdMap.get(via.dayId) ?? null : null,
          afterPoiId: via.afterPoiId ? poiIdMap.get(via.afterPoiId) ?? null : null,
          lat: via.lat,
          lng: via.lng,
          seq: via.seq,
        },
      });
    }

    return { id: trip.id };
  });
}
