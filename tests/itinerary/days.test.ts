import { test, expect, describe, beforeEach, afterAll } from "bun:test";
import { PrismaClient } from "@/lib/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { addDay, removeDay, addPoi, setNight, ItineraryError } from "@/lib/itinerary/operations";
import { createTrip } from "@/lib/trips/service";
import type { CreateTripData } from "@/lib/trips/schema";

const prisma = new PrismaClient({
  adapter: new PrismaLibSql({ url: process.env.DATABASE_URL ?? "file:./test.db" }),
});

beforeEach(async () => {
  await prisma.nightStop.deleteMany();
  await prisma.routeVia.deleteMany();
  await prisma.poi.deleteMany();
  await prisma.poiGroup.deleteMany();
  await prisma.day.deleteMany();
  await prisma.trip.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

function sampleTrip(dayCount = 2): CreateTripData {
  return {
    title: "T", description: "d", startDate: null, dayCount,
    start: { name: "S", lat: 0, lng: 0, placeId: null },
  };
}

describe("addDay", () => {
  test("appends a day at the next index", async () => {
    const trip = await createTrip(prisma, sampleTrip(2));
    const d = await addDay(prisma, trip.id);
    expect(d.dayIndex).toBe(2);
    expect(await prisma.day.count({ where: { tripId: trip.id } })).toBe(3);
  });
});

describe("removeDay", () => {
  test("sends the day's POIs back to the pool, deletes its night, and renumbers", async () => {
    const trip = await createTrip(prisma, sampleTrip(3));
    const day0 = trip.days[0].id;
    const day1 = trip.days[1].id;
    const p = await addPoi(prisma, trip.id, { name: "P", lat: 1, lng: 1, dayId: day0 });
    await setNight(prisma, day0, { lat: 0.5, lng: 0.5 });

    await removeDay(prisma, day0);

    const fresh = await prisma.poi.findUnique({ where: { id: p.id } });
    expect(fresh?.dayId).toBeNull();
    expect(fresh?.orderInDay).toBeNull();
    expect(await prisma.nightStop.count()).toBe(0);
    const days = await prisma.day.findMany({ where: { tripId: trip.id }, orderBy: { dayIndex: "asc" } });
    expect(days.map((d) => d.dayIndex)).toEqual([0, 1]);
    expect(days[0].id).toBe(day1);
  });

  test("throws for a non-existent day", async () => {
    const trip = await createTrip(prisma, sampleTrip(1));
    await expect(removeDay(prisma, "nope")).rejects.toBeInstanceOf(ItineraryError);
  });
});
