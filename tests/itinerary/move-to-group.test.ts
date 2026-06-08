import { test, expect, describe, beforeEach, afterAll } from "bun:test";
import { PrismaClient } from "@/lib/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { createGroup, moveToGroup, addPoi, ItineraryError } from "@/lib/itinerary/operations";
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
    title: "T", description: "d", startDate: null, dayCount: 1,
    start: { name: "S", lat: 0, lng: 0, placeId: null },
  };
}

describe("moveToGroup", () => {
  test("inserts into a group at the index and re-indexes", async () => {
    const trip = await createTrip(prisma, sampleTrip());
    const g = await createGroup(prisma, trip.id, "G");
    const a = await addPoi(prisma, trip.id, { name: "A", lat: 1, lng: 1, groupId: g.id });
    const b = await addPoi(prisma, trip.id, { name: "B", lat: 2, lng: 2, groupId: g.id });
    const c = await addPoi(prisma, trip.id, { name: "C", lat: 3, lng: 3 });

    await moveToGroup(prisma, c.id, g.id, 1);

    const inGroup = await prisma.poi.findMany({
      where: { groupId: g.id },
      orderBy: { orderInGroup: "asc" },
    });
    expect(inGroup.map((p) => p.id)).toEqual([a.id, c.id, b.id]);
    expect(inGroup.map((p) => p.orderInGroup)).toEqual([0, 1, 2]);
  });

  test("moving to ungrouped (null) re-indexes the source group", async () => {
    const trip = await createTrip(prisma, sampleTrip());
    const g = await createGroup(prisma, trip.id, "G");
    const a = await addPoi(prisma, trip.id, { name: "A", lat: 1, lng: 1, groupId: g.id });
    const b = await addPoi(prisma, trip.id, { name: "B", lat: 2, lng: 2, groupId: g.id });

    await moveToGroup(prisma, a.id, null, 0);

    expect((await prisma.poi.findUnique({ where: { id: a.id } }))?.groupId).toBeNull();
    expect((await prisma.poi.findUnique({ where: { id: b.id } }))?.orderInGroup).toBe(0);
  });

  test("rejects a group from a different trip", async () => {
    const tripA = await createTrip(prisma, sampleTrip());
    const tripB = await createTrip(prisma, sampleTrip());
    const gB = await createGroup(prisma, tripB.id, "B");
    const p = await addPoi(prisma, tripA.id, { name: "P", lat: 1, lng: 1 });
    await expect(moveToGroup(prisma, p.id, gB.id, 0)).rejects.toBeInstanceOf(ItineraryError);
  });
});
