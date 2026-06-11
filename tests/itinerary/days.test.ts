import { test, expect, describe, beforeEach, afterAll } from "bun:test";
import { PrismaClient } from "@/lib/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { addDay, insertDayAfter, removeDay, addPoi, setNight, ItineraryError } from "@/lib/itinerary/operations";
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

describe("insertDayAfter", () => {
  test("inserts a day at index+1 and shifts later days up, keeping their ids", async () => {
    const trip = await createTrip(prisma, sampleTrip(3));
    const [d0, d1, d2] = trip.days.map((d) => d.id); // indices 0,1,2

    const inserted = await insertDayAfter(prisma, trip.id, d0);
    expect(inserted.dayIndex).toBe(1);

    const days = await prisma.day.findMany({ where: { tripId: trip.id }, orderBy: { dayIndex: "asc" } });
    expect(days.map((d) => d.dayIndex)).toEqual([0, 1, 2, 3]);
    expect(days.map((d) => d.id)).toEqual([d0, inserted.id, d1, d2]);
  });

  test("inserting after the last day appends", async () => {
    const trip = await createTrip(prisma, sampleTrip(2));
    const last = trip.days[1].id;
    const inserted = await insertDayAfter(prisma, trip.id, last);
    expect(inserted.dayIndex).toBe(2);
    expect(await prisma.day.count({ where: { tripId: trip.id } })).toBe(3);
  });

  test("a place assigned to a shifted day stays on that same day", async () => {
    const trip = await createTrip(prisma, sampleTrip(2));
    const [d0, d1] = trip.days.map((d) => d.id);
    const p = await addPoi(prisma, trip.id, { name: "P", lat: 1, lng: 1, dayId: d1 });

    await insertDayAfter(prisma, trip.id, d0); // d1 shifts from index 1 to 2

    const fresh = await prisma.poi.findUnique({ where: { id: p.id } });
    expect(fresh?.dayId).toBe(d1);
    const shifted = await prisma.day.findUnique({ where: { id: d1 } });
    expect(shifted?.dayIndex).toBe(2);
  });

  test("throws for a day that isn't in the trip", async () => {
    const trip = await createTrip(prisma, sampleTrip(1));
    await expect(insertDayAfter(prisma, trip.id, "nope")).rejects.toBeInstanceOf(ItineraryError);
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
