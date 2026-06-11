import { test, expect, describe, beforeEach, afterAll } from "bun:test";
import { PrismaClient } from "@/lib/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { addPoi } from "@/lib/itinerary/operations";
import { splitPoolIntoDays, resplitAll } from "@/lib/itinerary/split-trip";
import { createTrip, updateTrip } from "@/lib/trips/service";
import type { CreateTripData } from "@/lib/trips/schema";
import type { ComputedRoute } from "@/lib/routing/routes";
import type { Session } from "@/lib/auth/session";

const prisma = new PrismaClient({
  adapter: new PrismaLibSql({ url: process.env.DATABASE_URL ?? "file:./test.db" }),
});

let session: Session;

beforeEach(async () => {
  await prisma.poi.deleteMany();
  await prisma.day.deleteMany();
  await prisma.tripShare.deleteMany();
  await prisma.trip.deleteMany();
  await prisma.user.deleteMany();
  const user = await prisma.user.create({ data: { email: "owner@x.com" } });
  session = { userId: user.id, email: "owner@x.com" };
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

function legRoute(legSeconds: number[]): ComputedRoute {
  return {
    encodedPolyline: "p",
    legs: legSeconds.map((s) => ({ durationSeconds: s, distanceMeters: 0 })),
    totalDurationSeconds: legSeconds.reduce((a, b) => a + b, 0),
    totalDistanceMeters: 0,
  };
}

describe("splitPoolIntoDays", () => {
  test("orders the pool by corridor and splits it across days by the cap", async () => {
    const trip = await createTrip(prisma, sampleTrip(2), session.userId);
    const c = await addPoi(prisma, trip.id, { name: "C", lat: 0, lng: 8 });
    const a = await addPoi(prisma, trip.id, { name: "A", lat: 0, lng: 2 });
    const b = await addPoi(prisma, trip.id, { name: "B", lat: 0, lng: 5 });
    // ordered A,B,C → legs [start->A, A->B, B->C] = [60,60,60]; cap 130 → day0 holds A+B, C → day1
    await splitPoolIntoDays(prisma, trip.id, async () => legRoute([60, 60, 60]), 130);

    const fresh = await prisma.poi.findMany();
    const dayOf = (id: string) => fresh.find((p) => p.id === id)!.dayId;
    expect(dayOf(a.id)).toBe(trip.days[0].id);
    expect(dayOf(b.id)).toBe(trip.days[0].id);
    expect(dayOf(c.id)).toBe(trip.days[1].id);
    expect(fresh.every((p) => p.dayId !== null)).toBe(true);
  });

  test("open finish: the computed route ends at the last stop, not back at start", async () => {
    const trip = await createTrip(prisma, sampleTrip(2), session.userId); // open (no end, not round trip)
    await addPoi(prisma, trip.id, { name: "A", lat: 0, lng: 2 });
    await addPoi(prisma, trip.id, { name: "B", lat: 0, lng: 5 });
    let captured: { lat: number; lng: number }[] = [];
    await splitPoolIntoDays(
      prisma,
      trip.id,
      async (pts) => {
        captured = pts;
        return legRoute([60, 60]);
      },
      1000,
    );
    expect(captured).toHaveLength(3); // start, A, B — no return leg
    expect(captured[captured.length - 1]).toEqual({ lat: 0, lng: 5 });
  });

  test("round trip: the computed route returns to start", async () => {
    const trip = await createTrip(prisma, sampleTrip(2), session.userId);
    await updateTrip(prisma, trip.id, { finish: { mode: "round" } }, session);
    await addPoi(prisma, trip.id, { name: "A", lat: 0, lng: 2 });
    await addPoi(prisma, trip.id, { name: "B", lat: 0, lng: 5 });
    let captured: { lat: number; lng: number }[] = [];
    await splitPoolIntoDays(
      prisma,
      trip.id,
      async (pts) => {
        captured = pts;
        return legRoute([60, 60, 60]);
      },
      1000,
    );
    expect(captured).toHaveLength(4); // start, A, B, start
    expect(captured[captured.length - 1]).toEqual({ lat: 0, lng: 0 });
  });

  test("does nothing when the pool is empty", async () => {
    const trip = await createTrip(prisma, sampleTrip(2), session.userId);
    let called = false;
    await splitPoolIntoDays(prisma, trip.id, async () => {
      called = true;
      return legRoute([]);
    }, 100);
    expect(called).toBe(false);
  });
});

describe("resplitAll", () => {
  test("moves every assigned stop back to the pool, then splits everything", async () => {
    const trip = await createTrip(prisma, sampleTrip(2), session.userId);
    const a = await addPoi(prisma, trip.id, { name: "A", lat: 0, lng: 2, dayId: trip.days[1].id });
    const b = await addPoi(prisma, trip.id, { name: "B", lat: 0, lng: 5 });
    const c = await addPoi(prisma, trip.id, { name: "C", lat: 0, lng: 8 });
    // after reset, corridor order A,B,C; legs [60,60,60]; cap 130 → [0,0,1]
    await resplitAll(prisma, trip.id, async () => legRoute([60, 60, 60]), 130);

    const fresh = await prisma.poi.findMany();
    const dayOf = (id: string) => fresh.find((p) => p.id === id)!.dayId;
    expect(dayOf(a.id)).toBe(trip.days[0].id);
    expect(dayOf(b.id)).toBe(trip.days[0].id);
    expect(dayOf(c.id)).toBe(trip.days[1].id);
  });
});
