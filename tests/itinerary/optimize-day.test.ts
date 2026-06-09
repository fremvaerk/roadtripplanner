import { test, expect, describe, beforeEach, afterAll } from "bun:test";
import { PrismaClient } from "@/lib/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { addPoi, optimizeDay } from "@/lib/itinerary/operations";
import { createTrip } from "@/lib/trips/service";
import type { CreateTripData } from "@/lib/trips/schema";
import type { ComputedRoute } from "@/lib/routing/routes";

const prisma = new PrismaClient({
  adapter: new PrismaLibSql({ url: process.env.DATABASE_URL ?? "file:./test.db" }),
});

beforeEach(async () => {
  await prisma.poi.deleteMany();
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

function fakeRoute(optimizedOrder?: number[]): ComputedRoute {
  return {
    encodedPolyline: "p",
    legs: [],
    totalDurationSeconds: 0,
    totalDistanceMeters: 0,
    optimizedOrder,
  };
}

describe("optimizeDay", () => {
  test("reorders the middle stops per the optimized order (origin & last fixed)", async () => {
    const trip = await createTrip(prisma, sampleTrip());
    const dayId = trip.days[0].id;
    const a = await addPoi(prisma, trip.id, { name: "A", lat: 1, lng: 1, dayId });
    const b = await addPoi(prisma, trip.id, { name: "B", lat: 2, lng: 2, dayId });
    const c = await addPoi(prisma, trip.id, { name: "C", lat: 3, lng: 3, dayId });
    const d = await addPoi(prisma, trip.id, { name: "D", lat: 4, lng: 4, dayId });
    await optimizeDay(prisma, dayId, async () => fakeRoute([1, 0]));

    const inDay = await prisma.poi.findMany({ where: { dayId }, orderBy: { orderInDay: "asc" } });
    expect(inDay.map((p) => p.id)).toEqual([a.id, c.id, b.id, d.id]);
  });

  test("is a no-op for fewer than 3 stops (computeFn not called)", async () => {
    const trip = await createTrip(prisma, sampleTrip());
    const dayId = trip.days[0].id;
    const a = await addPoi(prisma, trip.id, { name: "A", lat: 1, lng: 1, dayId });
    const b = await addPoi(prisma, trip.id, { name: "B", lat: 2, lng: 2, dayId });
    let called = false;
    await optimizeDay(prisma, dayId, async () => {
      called = true;
      return fakeRoute([]);
    });
    expect(called).toBe(false);
    const inDay = await prisma.poi.findMany({ where: { dayId }, orderBy: { orderInDay: "asc" } });
    expect(inDay.map((p) => p.id)).toEqual([a.id, b.id]);
  });
});
