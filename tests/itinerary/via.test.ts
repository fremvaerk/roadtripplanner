import { test, expect, describe, beforeEach, afterAll } from "bun:test";
import { PrismaClient } from "@/lib/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { addVia, moveVia, removeVia, addPoi, ItineraryError } from "@/lib/itinerary/operations";
import { createTrip } from "@/lib/trips/service";
import type { CreateTripData } from "@/lib/trips/schema";

const prisma = new PrismaClient({
  adapter: new PrismaLibSql({ url: process.env.DATABASE_URL ?? "file:./test.db" }),
});

beforeEach(async () => {
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
    title: "T", description: "d", startDate: null, dayCount: 1,
    start: { name: "S", lat: 0, lng: 0, placeId: null },
  };
}

describe("via operations", () => {
  test("addVia with null anchor sets sequential seq", async () => {
    const trip = await createTrip(prisma, sampleTrip());
    const v0 = await addVia(prisma, trip.id, { afterPoiId: null, lat: 0.5, lng: 0.5 });
    const v1 = await addVia(prisma, trip.id, { afterPoiId: null, lat: 0.6, lng: 0.6 });
    expect(v0.afterPoiId).toBeNull();
    expect(v0.seq).toBe(0);
    expect(v1.seq).toBe(1);
  });

  test("addVia anchored to a stop validates the stop belongs to the trip", async () => {
    const trip = await createTrip(prisma, sampleTrip());
    const stop = await addPoi(prisma, trip.id, { name: "A", lat: 0.2, lng: 0.2, dayId: trip.days[0].id });
    const v = await addVia(prisma, trip.id, { afterPoiId: stop.id, lat: 0.3, lng: 0.3 });
    expect(v.afterPoiId).toBe(stop.id);
    expect(v.seq).toBe(0);
  });

  test("addVia rejects an anchor stop from a different trip", async () => {
    const tripA = await createTrip(prisma, sampleTrip());
    const tripB = await createTrip(prisma, sampleTrip());
    const stopB = await addPoi(prisma, tripB.id, { name: "B", lat: 0.2, lng: 0.2, dayId: tripB.days[0].id });
    await expect(
      addVia(prisma, tripA.id, { afterPoiId: stopB.id, lat: 0.3, lng: 0.3 }),
    ).rejects.toBeInstanceOf(ItineraryError);
  });

  test("seq stays gap-safe after a delete-then-add (no collision)", async () => {
    const trip = await createTrip(prisma, sampleTrip());
    const v0 = await addVia(prisma, trip.id, { afterPoiId: null, lat: 0.1, lng: 0.1 }); // seq 0
    await addVia(prisma, trip.id, { afterPoiId: null, lat: 0.2, lng: 0.2 }); // seq 1
    await removeVia(prisma, v0.id);
    const v2 = await addVia(prisma, trip.id, { afterPoiId: null, lat: 0.3, lng: 0.3 });
    expect(v2.seq).toBe(2); // max(seq)+1, not count (which would collide at 1)
  });

  test("moveVia updates coordinates", async () => {
    const trip = await createTrip(prisma, sampleTrip());
    const v = await addVia(prisma, trip.id, { afterPoiId: null, lat: 0.5, lng: 0.5 });
    const m = await moveVia(prisma, v.id, { lat: 0.9, lng: 0.8 });
    expect(m.lat).toBeCloseTo(0.9);
    expect(m.lng).toBeCloseTo(0.8);
  });

  test("removeVia deletes it", async () => {
    const trip = await createTrip(prisma, sampleTrip());
    const v = await addVia(prisma, trip.id, { afterPoiId: null, lat: 0.5, lng: 0.5 });
    await removeVia(prisma, v.id);
    expect(await prisma.routeVia.count()).toBe(0);
  });
});
