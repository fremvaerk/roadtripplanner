import { test, expect, describe, beforeEach, afterAll } from "bun:test";
import { PrismaClient } from "@/lib/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { createTrip } from "@/lib/trips/service";
import { updatePoi } from "@/lib/itinerary/operations";

const prisma = new PrismaClient({
  adapter: new PrismaLibSql({ url: process.env.DATABASE_URL ?? "file:./test.db" }),
});

beforeEach(async () => {
  await prisma.poi.deleteMany();
  await prisma.day.deleteMany();
  await prisma.trip.deleteMany();
});
afterAll(async () => { await prisma.$disconnect(); });

describe("updatePoi", () => {
  test("sets address and placeId (enrichment cache)", async () => {
    const trip = await createTrip(prisma, {
      title: "T", description: "", startDate: null, dayCount: 1,
      start: { name: "S", lat: 0, lng: 0, placeId: null },
    });
    const poi = await prisma.poi.create({
      data: { tripId: trip.id, name: "X", lat: 1, lng: 2, placeId: null, source: "ai" },
    });
    const updated = await updatePoi(prisma, poi.id, {
      imageUrl: "https://example.com/p.jpg", address: "Somewhere 1", placeId: "place_123",
    });
    expect(updated.imageUrl).toBe("https://example.com/p.jpg");
    expect(updated.address).toBe("Somewhere 1");
    expect(updated.placeId).toBe("place_123");
  });
});
