import { test, expect, describe, beforeEach, afterAll } from "bun:test";
import { PrismaClient } from "@/lib/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { addPoi, removePoi } from "@/lib/itinerary/operations";
import { createTrip } from "@/lib/trips/service";
import type { CreateTripData } from "@/lib/trips/schema";

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
});

describe("removePoi", () => {
  test("removes a POI", async () => {
    const trip = await createTrip(prisma, sampleTrip());
    const poi = await addPoi(prisma, trip.id, { name: "X", lat: 1, lng: 2 });
    await removePoi(prisma, poi.id);
    expect(await prisma.poi.count()).toBe(0);
  });
});
