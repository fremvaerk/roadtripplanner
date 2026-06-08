import { test, expect, describe, beforeEach, afterAll } from "bun:test";
import { PrismaClient } from "@/lib/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { setNight, updateNight, clearNight, ItineraryError } from "@/lib/itinerary/operations";
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

function sampleTrip(): CreateTripData {
  return {
    title: "T", description: "d", isRoundTrip: false, startDate: null, dayCount: 2,
    start: { name: "S", lat: 0, lng: 0, placeId: null },
    end: { name: "E", lat: 1, lng: 1, placeId: null },
  };
}

describe("night operations", () => {
  test("setNight creates the day's night with details", async () => {
    const trip = await createTrip(prisma, sampleTrip());
    const n = await setNight(prisma, trip.days[0].id, {
      lat: 0.5, lng: 0.5, title: "Parking near forest", url: "https://airbnb.com/x", notes: "quiet",
    });
    expect(n.dayId).toBe(trip.days[0].id);
    expect(n.title).toBe("Parking near forest");
    expect(n.url).toBe("https://airbnb.com/x");
  });

  test("setNight is one-per-day (upsert overwrites)", async () => {
    const trip = await createTrip(prisma, sampleTrip());
    await setNight(prisma, trip.days[0].id, { lat: 0.5, lng: 0.5, title: "A" });
    const n2 = await setNight(prisma, trip.days[0].id, { lat: 0.6, lng: 0.6, title: "B" });
    expect(n2.title).toBe("B");
    expect(await prisma.nightStop.count({ where: { dayId: trip.days[0].id } })).toBe(1);
  });

  test("updateNight changes coordinates and details", async () => {
    const trip = await createTrip(prisma, sampleTrip());
    await setNight(prisma, trip.days[0].id, { lat: 0.5, lng: 0.5 });
    const u = await updateNight(prisma, trip.days[0].id, { lat: 0.9, title: "Moved" });
    expect(u.lat).toBeCloseTo(0.9);
    expect(u.title).toBe("Moved");
    expect(u.lng).toBeCloseTo(0.5);
  });

  test("clearNight removes it", async () => {
    const trip = await createTrip(prisma, sampleTrip());
    await setNight(prisma, trip.days[0].id, { lat: 0.5, lng: 0.5 });
    await clearNight(prisma, trip.days[0].id);
    expect(await prisma.nightStop.count()).toBe(0);
  });

  test("updateNight on a day with no night throws", async () => {
    const trip = await createTrip(prisma, sampleTrip());
    await expect(updateNight(prisma, trip.days[1].id, { lat: 1 })).rejects.toBeInstanceOf(ItineraryError);
  });
});
