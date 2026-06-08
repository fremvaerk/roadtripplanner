import { test, expect, describe, beforeEach, afterAll } from "bun:test";
import { PrismaClient } from "@/lib/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import {
  createTrip,
  getTrip,
  listTrips,
  updateTrip,
  deleteTrip,
} from "@/lib/trips/service";
import type { CreateTripData } from "@/lib/trips/schema";

const prisma = new PrismaClient({
  adapter: new PrismaLibSql({
    url: process.env.DATABASE_URL ?? "file:./test.db",
  }),
});

beforeEach(async () => {
  await prisma.poi.deleteMany();
  await prisma.day.deleteMany();
  await prisma.trip.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

function sampleData(overrides: Partial<CreateTripData> = {}): CreateTripData {
  return {
    title: "Tuscany Loop",
    description: "Relaxed week of food and art.",
    startDate: null,
    dayCount: 3,
    start: { name: "Florence", lat: 43.77, lng: 11.25, placeId: "p_start" },
    ...overrides,
  };
}

describe("trip service", () => {
  test("createTrip stores the trip and seeds empty days", async () => {
    const trip = await createTrip(prisma, sampleData());
    expect(trip.id).toBeTruthy();
    expect(trip.startName).toBe("Florence");
    expect(trip.days).toHaveLength(3);
    expect(trip.days.map((d) => d.dayIndex)).toEqual([0, 1, 2]);
  });

  test("createTrip defaults to an open finish (no end, not a round trip)", async () => {
    const trip = await createTrip(prisma, sampleData({ dayCount: 1 }));
    expect(trip.isRoundTrip).toBe(false);
    expect(trip.endName).toBeNull();
    expect(trip.endLat).toBeNull();
  });

  test("getTrip returns the trip with ordered days", async () => {
    const created = await createTrip(prisma, sampleData());
    const trip = await getTrip(prisma, created.id);
    expect(trip).not.toBeNull();
    expect(trip!.days).toHaveLength(3);
  });

  test("getTrip returns null for an unknown id", async () => {
    expect(await getTrip(prisma, "nope")).toBeNull();
  });

  test("listTrips returns all trips, newest first", async () => {
    await createTrip(prisma, sampleData({ title: "A" }));
    await createTrip(prisma, sampleData({ title: "B" }));
    const trips = await listTrips(prisma);
    expect(trips).toHaveLength(2);
  });

  test("updateTrip changes title and description", async () => {
    const created = await createTrip(prisma, sampleData());
    const updated = await updateTrip(prisma, created.id, { title: "Renamed" });
    expect(updated.title).toBe("Renamed");
  });

  test("updateTrip sets and clears startDate", async () => {
    const created = await createTrip(prisma, sampleData());
    const set = await updateTrip(prisma, created.id, { startDate: new Date("2026-06-09T00:00:00.000Z") });
    expect(set.startDate?.toISOString().slice(0, 10)).toBe("2026-06-09");
    const cleared = await updateTrip(prisma, created.id, { startDate: null });
    expect(cleared.startDate).toBeNull();
  });

  test("updateTrip sets the start location", async () => {
    const created = await createTrip(prisma, sampleData());
    const updated = await updateTrip(prisma, created.id, {
      start: { name: "Pisa", lat: 43.72, lng: 10.4, placeId: "p_pisa" },
    });
    expect(updated.startName).toBe("Pisa");
    expect(updated.startLat).toBeCloseTo(43.72);
    expect(updated.startPlaceId).toBe("p_pisa");
  });

  test("updateTrip finish=place sets end and clears round trip", async () => {
    const created = await createTrip(prisma, sampleData());
    const updated = await updateTrip(prisma, created.id, {
      finish: { mode: "place", place: { name: "Rome", lat: 41.9, lng: 12.5, placeId: "p_rome" } },
    });
    expect(updated.isRoundTrip).toBe(false);
    expect(updated.endName).toBe("Rome");
    expect(updated.endLat).toBeCloseTo(41.9);
  });

  test("updateTrip finish=round sets round trip and clears end", async () => {
    const created = await createTrip(prisma, sampleData());
    await updateTrip(prisma, created.id, {
      finish: { mode: "place", place: { name: "Rome", lat: 41.9, lng: 12.5, placeId: null } },
    });
    const updated = await updateTrip(prisma, created.id, { finish: { mode: "round" } });
    expect(updated.isRoundTrip).toBe(true);
    expect(updated.endName).toBeNull();
    expect(updated.endLat).toBeNull();
  });

  test("updateTrip finish=open clears both round trip and end", async () => {
    const created = await createTrip(prisma, sampleData());
    await updateTrip(prisma, created.id, { finish: { mode: "round" } });
    const updated = await updateTrip(prisma, created.id, { finish: { mode: "open" } });
    expect(updated.isRoundTrip).toBe(false);
    expect(updated.endName).toBeNull();
  });

  test("deleteTrip removes the trip and cascades days", async () => {
    const created = await createTrip(prisma, sampleData());
    await deleteTrip(prisma, created.id);
    expect(await getTrip(prisma, created.id)).toBeNull();
    expect(await prisma.day.count()).toBe(0);
  });
});
