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
import type { Session } from "@/lib/auth/session";

const prisma = new PrismaClient({
  adapter: new PrismaLibSql({
    url: process.env.DATABASE_URL ?? "file:./test.db",
  }),
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
    const trip = await createTrip(prisma, sampleData(), session.userId);
    expect(trip.id).toBeTruthy();
    expect(trip.startName).toBe("Florence");
    expect(trip.days).toHaveLength(3);
    expect(trip.days.map((d) => d.dayIndex)).toEqual([0, 1, 2]);
  });

  test("createTrip defaults to an open finish (no end, not a round trip)", async () => {
    const trip = await createTrip(prisma, sampleData({ dayCount: 1 }), session.userId);
    expect(trip.isRoundTrip).toBe(false);
    expect(trip.endName).toBeNull();
    expect(trip.endLat).toBeNull();
  });

  test("getTrip returns the trip with ordered days", async () => {
    const created = await createTrip(prisma, sampleData(), session.userId);
    const trip = await getTrip(prisma, created.id, session);
    expect(trip).not.toBeNull();
    expect(trip!.days).toHaveLength(3);
  });

  test("getTrip returns null for an unknown id", async () => {
    expect(await getTrip(prisma, "nope", session)).toBeNull();
  });

  test("listTrips returns all trips, newest first", async () => {
    await createTrip(prisma, sampleData({ title: "A" }), session.userId);
    await createTrip(prisma, sampleData({ title: "B" }), session.userId);
    const trips = await listTrips(prisma, session);
    expect(trips).toHaveLength(2);
  });

  test("updateTrip changes title and description", async () => {
    const created = await createTrip(prisma, sampleData(), session.userId);
    const updated = await updateTrip(prisma, created.id, { title: "Renamed" }, session);
    expect(updated.title).toBe("Renamed");
  });

  test("updateTrip sets and clears startDate", async () => {
    const created = await createTrip(prisma, sampleData(), session.userId);
    const set = await updateTrip(prisma, created.id, { startDate: new Date("2026-06-09T00:00:00.000Z") }, session);
    expect(set.startDate?.toISOString().slice(0, 10)).toBe("2026-06-09");
    const cleared = await updateTrip(prisma, created.id, { startDate: null }, session);
    expect(cleared.startDate).toBeNull();
  });

  test("updateTrip sets the start location", async () => {
    const created = await createTrip(prisma, sampleData(), session.userId);
    const updated = await updateTrip(prisma, created.id, {
      start: { name: "Pisa", lat: 43.72, lng: 10.4, placeId: "p_pisa" },
    }, session);
    expect(updated.startName).toBe("Pisa");
    expect(updated.startLat).toBeCloseTo(43.72);
    expect(updated.startPlaceId).toBe("p_pisa");
  });

  test("updateTrip finish=place sets end and clears round trip", async () => {
    const created = await createTrip(prisma, sampleData(), session.userId);
    const updated = await updateTrip(prisma, created.id, {
      finish: { mode: "place", place: { name: "Rome", lat: 41.9, lng: 12.5, placeId: "p_rome" } },
    }, session);
    expect(updated.isRoundTrip).toBe(false);
    expect(updated.endName).toBe("Rome");
    expect(updated.endLat).toBeCloseTo(41.9);
  });

  test("updateTrip finish=round sets round trip and clears end", async () => {
    const created = await createTrip(prisma, sampleData(), session.userId);
    await updateTrip(prisma, created.id, {
      finish: { mode: "place", place: { name: "Rome", lat: 41.9, lng: 12.5, placeId: null } },
    }, session);
    const updated = await updateTrip(prisma, created.id, { finish: { mode: "round" } }, session);
    expect(updated.isRoundTrip).toBe(true);
    expect(updated.endName).toBeNull();
    expect(updated.endLat).toBeNull();
  });

  test("updateTrip finish=open clears both round trip and end", async () => {
    const created = await createTrip(prisma, sampleData(), session.userId);
    await updateTrip(prisma, created.id, { finish: { mode: "round" } }, session);
    const updated = await updateTrip(prisma, created.id, { finish: { mode: "open" } }, session);
    expect(updated.isRoundTrip).toBe(false);
    expect(updated.endName).toBeNull();
  });

  test("deleteTrip removes the trip and cascades days", async () => {
    const created = await createTrip(prisma, sampleData(), session.userId);
    await deleteTrip(prisma, created.id, session);
    expect(await getTrip(prisma, created.id, session)).toBeNull();
    expect(await prisma.day.count()).toBe(0);
  });

  test("updateTrip archives and restores a trip via archivedAt", async () => {
    const created = await createTrip(prisma, sampleData(), session.userId);
    expect(created.archivedAt).toBeNull();

    const archived = await updateTrip(prisma, created.id, { archived: true }, session);
    expect(archived.archivedAt).toBeInstanceOf(Date);

    const restored = await updateTrip(prisma, created.id, { archived: false }, session);
    expect(restored.archivedAt).toBeNull();
  });

  test("updateTrip leaves archivedAt untouched when archived is omitted", async () => {
    const created = await createTrip(prisma, sampleData(), session.userId);
    await updateTrip(prisma, created.id, { archived: true }, session);
    const renamed = await updateTrip(prisma, created.id, { title: "Renamed" }, session);
    expect(renamed.archivedAt).toBeInstanceOf(Date);
  });

  test("listTrips includes archived trips", async () => {
    const created = await createTrip(prisma, sampleData({ title: "A" }), session.userId);
    await updateTrip(prisma, created.id, { archived: true }, session);
    const trips = await listTrips(prisma, session);
    expect(trips).toHaveLength(1);
    expect(trips[0].archivedAt).toBeInstanceOf(Date);
  });

  test("deleteTrip cascades to pois", async () => {
    const created = await createTrip(prisma, sampleData(), session.userId);
    await prisma.poi.create({
      data: {
        tripId: created.id,
        name: "Gelato stop",
        lat: 43.77,
        lng: 11.25,
        placeId: null,
        source: "manual",
        status: "unassigned",
      },
    });
    expect(await prisma.poi.count()).toBe(1);
    await deleteTrip(prisma, created.id, session);
    expect(await prisma.poi.count()).toBe(0);
  });
});

describe("trip service — cross-user isolation & sharing", () => {
  async function status(fn: () => Promise<unknown>): Promise<number | "ok"> {
    try {
      await fn();
      return "ok";
    } catch (e) {
      return (e as { status?: number }).status ?? -1;
    }
  }

  test("a stranger cannot read, list, update, or delete another user's trip", async () => {
    const a = await prisma.user.create({ data: { email: "a@x.com" } });
    const b = await prisma.user.create({ data: { email: "b@x.com" } });
    const sA: Session = { userId: a.id, email: "a@x.com" };
    const sB: Session = { userId: b.id, email: "b@x.com" };
    const trip = await createTrip(prisma, sampleData(), a.id);

    expect(await getTrip(prisma, trip.id, sB)).toBeNull(); // existence not leaked
    expect(await listTrips(prisma, sB)).toHaveLength(0);
    expect(await status(() => updateTrip(prisma, trip.id, { title: "x" }, sB))).toBe(404);
    expect(await status(() => deleteTrip(prisma, trip.id, sB))).toBe(404);
    // owner still has full access
    expect((await getTrip(prisma, trip.id, sA))?.role).toBe("owner");
  });

  test("a viewer share grants read (with role) but not write", async () => {
    const a = await prisma.user.create({ data: { email: "a@x.com" } });
    const b = await prisma.user.create({ data: { email: "b@x.com" } });
    const sB: Session = { userId: b.id, email: "b@x.com" };
    const trip = await createTrip(prisma, sampleData(), a.id);
    await prisma.tripShare.create({ data: { tripId: trip.id, email: "b@x.com", role: "viewer" } });

    expect((await getTrip(prisma, trip.id, sB))?.role).toBe("viewer");
    const listed = await listTrips(prisma, sB);
    expect(listed).toHaveLength(1);
    expect((listed[0] as { role: string }).role).toBe("viewer");
    expect(await status(() => updateTrip(prisma, trip.id, { title: "x" }, sB))).toBe(403);
    expect(await status(() => deleteTrip(prisma, trip.id, sB))).toBe(403);
  });

  test("an editor share grants write but not delete (owner-only)", async () => {
    const a = await prisma.user.create({ data: { email: "a@x.com" } });
    const c = await prisma.user.create({ data: { email: "c@x.com" } });
    const sC: Session = { userId: c.id, email: "c@x.com" };
    const trip = await createTrip(prisma, sampleData(), a.id);
    await prisma.tripShare.create({ data: { tripId: trip.id, email: "c@x.com", role: "editor" } });

    expect((await getTrip(prisma, trip.id, sC))?.role).toBe("editor");
    const updated = await updateTrip(prisma, trip.id, { title: "Renamed by editor" }, sC);
    expect(updated.title).toBe("Renamed by editor");
    expect(await status(() => deleteTrip(prisma, trip.id, sC))).toBe(403);
  });
});
