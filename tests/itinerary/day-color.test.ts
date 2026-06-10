import { test, expect, describe, beforeEach, afterAll } from "bun:test";
import { PrismaClient } from "@/lib/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { createTrip } from "@/lib/trips/service";
import { setDayColor } from "@/lib/itinerary/operations";

const prisma = new PrismaClient({
  adapter: new PrismaLibSql({ url: process.env.DATABASE_URL ?? "file:./test.db" }),
});

beforeEach(async () => {
  await prisma.poi.deleteMany();
  await prisma.day.deleteMany();
  await prisma.trip.deleteMany();
});
afterAll(async () => { await prisma.$disconnect(); });

describe("setDayColor", () => {
  test("sets a day's color", async () => {
    const trip = await createTrip(prisma, {
      title: "T", description: "", startDate: null, dayCount: 1,
      start: { name: "S", lat: 0, lng: 0, placeId: null },
    });
    const day = trip.days[0];
    const updated = await setDayColor(prisma, day.id, "#22c55e");
    expect(updated.color).toBe("#22c55e");
  });
});
