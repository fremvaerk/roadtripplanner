import { test, expect, describe, beforeEach, afterAll } from "bun:test";
import { PrismaClient } from "@/lib/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { addPoi, removePoi, ItineraryError, movePoi, setOvernight } from "@/lib/itinerary/operations";
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
    isRoundTrip: false,
    startDate: null,
    dayCount: 2,
    start: { name: "Florence", lat: 43.77, lng: 11.25, placeId: "p_start" },
    end: { name: "Rome", lat: 41.9, lng: 12.5, placeId: "p_end" },
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

  test("moves a day POI to the pool, clearing day/order/overnight and re-indexing the source day", async () => {
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

describe("setOvernight", () => {
  test("marks a day POI as the overnight", async () => {
    const trip = await createTrip(prisma, sampleTrip());
    const dayId = trip.days[0].id;
    const a = await addPoi(prisma, trip.id, { name: "A", lat: 1, lng: 1, dayId });
    await setOvernight(prisma, a.id, true);
    const got = await prisma.poi.findUnique({ where: { id: a.id } });
    expect(got?.isOvernight).toBe(true);
  });

  test("only one overnight per day — setting a second clears the first", async () => {
    const trip = await createTrip(prisma, sampleTrip());
    const dayId = trip.days[0].id;
    const a = await addPoi(prisma, trip.id, { name: "A", lat: 1, lng: 1, dayId });
    const b = await addPoi(prisma, trip.id, { name: "B", lat: 2, lng: 2, dayId });
    await setOvernight(prisma, a.id, true);
    await setOvernight(prisma, b.id, true);
    expect((await prisma.poi.findUnique({ where: { id: a.id } }))?.isOvernight).toBe(false);
    expect((await prisma.poi.findUnique({ where: { id: b.id } }))?.isOvernight).toBe(true);
  });

  test("unsetting overnight works", async () => {
    const trip = await createTrip(prisma, sampleTrip());
    const dayId = trip.days[0].id;
    const a = await addPoi(prisma, trip.id, { name: "A", lat: 1, lng: 1, dayId });
    await setOvernight(prisma, a.id, true);
    await setOvernight(prisma, a.id, false);
    expect((await prisma.poi.findUnique({ where: { id: a.id } }))?.isOvernight).toBe(false);
  });

  test("rejects marking a pool POI as overnight", async () => {
    const trip = await createTrip(prisma, sampleTrip());
    const a = await addPoi(prisma, trip.id, { name: "A", lat: 1, lng: 1 }); // pool
    await expect(setOvernight(prisma, a.id, true)).rejects.toBeInstanceOf(ItineraryError);
  });
});

describe("movePoi + overnight interaction", () => {
  test("moving an overnight POI to a different day clears its overnight flag", async () => {
    const trip = await createTrip(prisma, sampleTrip());
    const day1 = trip.days[0].id;
    const day2 = trip.days[1].id;
    const a = await addPoi(prisma, trip.id, { name: "A", lat: 1, lng: 1, dayId: day1 });
    await setOvernight(prisma, a.id, true);

    await movePoi(prisma, a.id, { dayId: day2, orderInDay: 0 });

    expect((await prisma.poi.findUnique({ where: { id: a.id } }))?.isOvernight).toBe(false);
  });

  test("reordering an overnight POI within the same day keeps its overnight flag", async () => {
    const trip = await createTrip(prisma, sampleTrip());
    const day1 = trip.days[0].id;
    const a = await addPoi(prisma, trip.id, { name: "A", lat: 1, lng: 1, dayId: day1 });
    await addPoi(prisma, trip.id, { name: "B", lat: 2, lng: 2, dayId: day1 });
    await setOvernight(prisma, a.id, true);

    await movePoi(prisma, a.id, { dayId: day1, orderInDay: 1 });

    expect((await prisma.poi.findUnique({ where: { id: a.id } }))?.isOvernight).toBe(true);
  });
});
