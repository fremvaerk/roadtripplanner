import { test, expect, describe, beforeEach, afterAll } from "bun:test";
import { PrismaClient } from "@/lib/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { addPoi, removePoi, ItineraryError, movePoi, updatePoi } from "@/lib/itinerary/operations";
import { patchPoiSchema } from "@/lib/itinerary/schema";
import { createTrip } from "@/lib/trips/service";
import type { CreateTripData } from "@/lib/trips/schema";

const prisma = new PrismaClient({
  adapter: new PrismaLibSql({ url: process.env.DATABASE_URL ?? "file:./test.db" }),
});

beforeEach(async () => {
  await prisma.poi.deleteMany();
  await prisma.poiGroup.deleteMany();
  await prisma.day.deleteMany();
  await prisma.trip.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

function sampleTrip(): CreateTripData {
  return {
    title: "Trip",
    description: "desc",
    startDate: null,
    dayCount: 2,
    start: { name: "Florence", lat: 43.77, lng: 11.25, placeId: "p_start" },
  };
}

describe("addPoi", () => {
  test("adds a POI to the unassigned pool (dayId null, orderInDay null)", async () => {
    const trip = await createTrip(prisma, sampleTrip());
    const poi = await addPoi(prisma, trip.id, {
      name: "Uffizi",
      lat: 43.768,
      lng: 11.255,
      placeId: "p_uffizi",
      category: "sight",
      source: "search",
    });
    expect(poi.id).toBeTruthy();
    expect(poi.tripId).toBe(trip.id);
    expect(poi.dayId).toBeNull();
    expect(poi.orderInDay).toBeNull();
    expect(poi.status).toBe("accepted");
    expect(poi.source).toBe("search");
  });

  test("defaults source to 'user' and category to null when omitted", async () => {
    const trip = await createTrip(prisma, sampleTrip());
    const poi = await addPoi(prisma, trip.id, { name: "X", lat: 1, lng: 2 });
    expect(poi.source).toBe("user");
    expect(poi.category).toBeNull();
    expect(poi.placeId).toBeNull();
  });

  test("when added to a day, orderInDay is the next index in that day", async () => {
    const trip = await createTrip(prisma, sampleTrip());
    const dayId = trip.days[0].id;
    const a = await addPoi(prisma, trip.id, { name: "A", lat: 1, lng: 1, dayId });
    const b = await addPoi(prisma, trip.id, { name: "B", lat: 2, lng: 2, dayId });
    expect(a.orderInDay).toBe(0);
    expect(b.orderInDay).toBe(1);
  });

  test("rejects a dayId that belongs to a different trip", async () => {
    const tripA = await createTrip(prisma, sampleTrip());
    const tripB = await createTrip(prisma, sampleTrip());
    const foreignDayId = tripB.days[0].id;
    await expect(
      addPoi(prisma, tripA.id, { name: "X", lat: 1, lng: 1, dayId: foreignDayId }),
    ).rejects.toBeInstanceOf(ItineraryError);
    expect(await prisma.poi.count()).toBe(0);
  });

  test("files a POI into a group with the next orderInGroup", async () => {
    const trip = await createTrip(prisma, sampleTrip());
    const group = await prisma.poiGroup.create({
      data: { tripId: trip.id, name: "Wineries", orderIndex: 0 },
    });
    const a = await addPoi(prisma, trip.id, { name: "A", lat: 1, lng: 1, groupId: group.id });
    const b = await addPoi(prisma, trip.id, { name: "B", lat: 2, lng: 2, groupId: group.id });
    expect(a.groupId).toBe(group.id);
    expect(a.orderInGroup).toBe(0);
    expect(b.orderInGroup).toBe(1);
  });

  test("ungrouped POIs get an orderInGroup within the ungrouped bucket", async () => {
    const trip = await createTrip(prisma, sampleTrip());
    const a = await addPoi(prisma, trip.id, { name: "A", lat: 1, lng: 1 });
    expect(a.groupId).toBeNull();
    expect(a.orderInGroup).toBe(0);
  });

  test("rejects a groupId that belongs to a different trip", async () => {
    const tripA = await createTrip(prisma, sampleTrip());
    const tripB = await createTrip(prisma, sampleTrip());
    const gB = await prisma.poiGroup.create({
      data: { tripId: tripB.id, name: "B", orderIndex: 0 },
    });
    await expect(
      addPoi(prisma, tripA.id, { name: "X", lat: 1, lng: 1, groupId: gB.id }),
    ).rejects.toBeInstanceOf(ItineraryError);
  });

  test("addPoi persists address, description and imageUrl", async () => {
    const trip = await createTrip(prisma, sampleTrip());
    const poi = await addPoi(prisma, trip.id, {
      name: "Uffizi",
      lat: 43.76,
      lng: 11.25,
      address: "Piazzale degli Uffizi, Firenze",
      description: "Renaissance gallery",
      imageUrl: "https://example.com/uffizi.jpg",
    });
    expect(poi.address).toBe("Piazzale degli Uffizi, Firenze");
    expect(poi.description).toBe("Renaissance gallery");
    expect(poi.imageUrl).toBe("https://example.com/uffizi.jpg");
  });

  test("omitting address, description and imageUrl stores nulls", async () => {
    const trip = await createTrip(prisma, sampleTrip());
    const poi = await addPoi(prisma, trip.id, { name: "X", lat: 1, lng: 2 });
    expect(poi.address).toBeNull();
    expect(poi.description).toBeNull();
    expect(poi.imageUrl).toBeNull();
  });

  test("updatePoi updates name, description and imageUrl", async () => {
    const trip = await createTrip(prisma, sampleTrip());
    const poi = await addPoi(prisma, trip.id, { name: "X", lat: 1, lng: 2 });
    const updated = await updatePoi(prisma, poi.id, {
      name: "Renamed",
      description: "New note",
      imageUrl: "https://example.com/new.jpg",
    });
    expect(updated.name).toBe("Renamed");
    expect(updated.description).toBe("New note");
    expect(updated.imageUrl).toBe("https://example.com/new.jpg");
  });

  test("updatePoi can clear description and imageUrl with null", async () => {
    const trip = await createTrip(prisma, sampleTrip());
    const poi = await addPoi(prisma, trip.id, {
      name: "X", lat: 1, lng: 2, description: "d", imageUrl: "https://e.com/i.jpg",
    });
    const updated = await updatePoi(prisma, poi.id, { description: null, imageUrl: null });
    expect(updated.description).toBeNull();
    expect(updated.imageUrl).toBeNull();
    expect(updated.name).toBe("X"); // untouched
  });

  test("patchPoiSchema edit variant validates fields", () => {
    expect(patchPoiSchema.safeParse({ op: "edit", name: "Y" }).success).toBe(true);
    expect(patchPoiSchema.safeParse({ op: "edit", imageUrl: null }).success).toBe(true);
    expect(patchPoiSchema.safeParse({ op: "edit", imageUrl: "https://e.com/i.jpg" }).success).toBe(true);
    expect(patchPoiSchema.safeParse({ op: "edit", imageUrl: "not a url" }).success).toBe(false);
    expect(patchPoiSchema.safeParse({ op: "edit", name: "" }).success).toBe(false);
  });
});

describe("removePoi", () => {
  test("removes a POI", async () => {
    const trip = await createTrip(prisma, sampleTrip());
    const poi = await addPoi(prisma, trip.id, { name: "X", lat: 1, lng: 2 });
    await removePoi(prisma, poi.id);
    expect(await prisma.poi.count()).toBe(0);
  });
});

describe("movePoi", () => {
  test("moves a pool POI into a day at the given index and re-indexes", async () => {
    const trip = await createTrip(prisma, sampleTrip());
    const dayId = trip.days[0].id;
    const a = await addPoi(prisma, trip.id, { name: "A", lat: 1, lng: 1, dayId });
    const b = await addPoi(prisma, trip.id, { name: "B", lat: 2, lng: 2, dayId });
    const c = await addPoi(prisma, trip.id, { name: "C", lat: 3, lng: 3 }); // pool

    await movePoi(prisma, c.id, { dayId, orderInDay: 1 });

    const inDay = await prisma.poi.findMany({
      where: { dayId },
      orderBy: { orderInDay: "asc" },
    });
    expect(inDay.map((p) => p.id)).toEqual([a.id, c.id, b.id]);
    expect(inDay.map((p) => p.orderInDay)).toEqual([0, 1, 2]);
  });

  test("moves a day POI to the pool, clearing day/order and re-indexing the source day", async () => {
    const trip = await createTrip(prisma, sampleTrip());
    const dayId = trip.days[0].id;
    const a = await addPoi(prisma, trip.id, { name: "A", lat: 1, lng: 1, dayId });
    const b = await addPoi(prisma, trip.id, { name: "B", lat: 2, lng: 2, dayId });

    await movePoi(prisma, a.id, { dayId: null, orderInDay: 0 });

    const moved = await prisma.poi.findUnique({ where: { id: a.id } });
    expect(moved?.dayId).toBeNull();
    expect(moved?.orderInDay).toBeNull();
    const remaining = await prisma.poi.findUnique({ where: { id: b.id } });
    expect(remaining?.orderInDay).toBe(0);
  });

  test("reorders within the same day", async () => {
    const trip = await createTrip(prisma, sampleTrip());
    const dayId = trip.days[0].id;
    const a = await addPoi(prisma, trip.id, { name: "A", lat: 1, lng: 1, dayId });
    const b = await addPoi(prisma, trip.id, { name: "B", lat: 2, lng: 2, dayId });
    const c = await addPoi(prisma, trip.id, { name: "C", lat: 3, lng: 3, dayId });

    await movePoi(prisma, c.id, { dayId, orderInDay: 0 });

    const inDay = await prisma.poi.findMany({ where: { dayId }, orderBy: { orderInDay: "asc" } });
    expect(inDay.map((p) => p.id)).toEqual([c.id, a.id, b.id]);
  });

  test("clamps an out-of-range index to the end of the day", async () => {
    const trip = await createTrip(prisma, sampleTrip());
    const dayId = trip.days[0].id;
    const a = await addPoi(prisma, trip.id, { name: "A", lat: 1, lng: 1, dayId });
    const c = await addPoi(prisma, trip.id, { name: "C", lat: 3, lng: 3 });

    await movePoi(prisma, c.id, { dayId, orderInDay: 99 });

    const inDay = await prisma.poi.findMany({ where: { dayId }, orderBy: { orderInDay: "asc" } });
    expect(inDay.map((p) => p.id)).toEqual([a.id, c.id]);
  });

  test("rejects moving into a day from a different trip", async () => {
    const tripA = await createTrip(prisma, sampleTrip());
    const tripB = await createTrip(prisma, sampleTrip());
    const poi = await addPoi(prisma, tripA.id, { name: "A", lat: 1, lng: 1 });
    await expect(
      movePoi(prisma, poi.id, { dayId: tripB.days[0].id, orderInDay: 0 }),
    ).rejects.toBeInstanceOf(ItineraryError);
  });
});
