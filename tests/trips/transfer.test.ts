import { test, expect, describe, beforeEach, afterAll } from "bun:test";
import { PrismaClient } from "@/lib/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { addPoi, setNight, createGroup, moveToGroup, addVia } from "@/lib/itinerary/operations";
import { createTrip } from "@/lib/trips/service";
import type { CreateTripData } from "@/lib/trips/schema";
import { serializeTrip, loadTripGraph, importTrip } from "@/lib/trips/transfer";

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
  await prisma.user.deleteMany();
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

describe("serializeTrip + importTrip", () => {
  test("exports a trip graph then imports it as a deep clone owned by a new user", async () => {
    const owner = await prisma.user.create({ data: { email: "owner@example.com" } });
    const other = await prisma.user.create({ data: { email: "other@example.com" } });

    const trip = await createTrip(prisma, sampleTrip(2), owner.id);
    const day0 = trip.days[0].id;

    const poi = await addPoi(prisma, trip.id, { name: "P", lat: 1, lng: 1, dayId: day0 });
    const group = await createGroup(prisma, trip.id, "G");
    await moveToGroup(prisma, poi.id, group.id, 0);
    await setNight(prisma, day0, { lat: 0.5, lng: 0.5, title: "Hotel" });
    await addVia(prisma, trip.id, { afterPoiId: poi.id, lat: 0.2, lng: 0.2 });

    // --- serialize
    const exp = serializeTrip((await loadTripGraph(prisma, trip.id))!);
    expect(exp.format).toBe("roadtripplanner.trip");
    expect(exp.version).toBe(1);
    expect(exp.days.length).toBe(2);
    expect(exp.pois.length).toBeGreaterThanOrEqual(1);
    expect(exp.groups.length).toBe(1);
    expect(exp.nights.length).toBe(1);
    expect(exp.vias.length).toBe(1);

    // --- import as the other user
    const { id: newId } = await importTrip(prisma, exp, other.id);
    expect(newId).not.toBe(trip.id);

    const cloned = (await loadTripGraph(prisma, newId))!;
    expect(cloned.userId).toBe(other.id);
    expect(cloned.archivedAt).toBeNull();

    // same counts
    expect(cloned.days.length).toBe(2);
    expect(cloned.pois.length).toBe(exp.pois.length);
    expect(cloned.poiGroups.length).toBe(1);
    expect(cloned.days.filter((d) => d.night != null).length).toBe(1);
    expect(cloned.routeVias.length).toBe(1);

    // remapped cross-refs resolve within the new trip
    const clonedPoi = cloned.pois[0];
    expect(clonedPoi.dayId).not.toBeNull();
    expect(cloned.days.some((d) => d.id === clonedPoi.dayId)).toBe(true);
    expect(clonedPoi.groupId).not.toBeNull();
    expect(cloned.poiGroups.some((g) => g.id === clonedPoi.groupId)).toBe(true);

    const clonedVia = cloned.routeVias[0];
    expect(clonedVia.afterPoiId).not.toBeNull();
    expect(cloned.pois.some((p) => p.id === clonedVia.afterPoiId)).toBe(true);

    // no id overlaps with the original (ids regenerated)
    const originalGraph = (await loadTripGraph(prisma, trip.id))!;
    const originalIds = new Set<string>([
      originalGraph.id,
      ...originalGraph.days.map((d) => d.id),
      ...originalGraph.pois.map((p) => p.id),
      ...originalGraph.poiGroups.map((g) => g.id),
    ]);
    const clonedIds = [
      cloned.id,
      ...cloned.days.map((d) => d.id),
      ...cloned.pois.map((p) => p.id),
      ...cloned.poiGroups.map((g) => g.id),
    ];
    for (const id of clonedIds) {
      expect(originalIds.has(id)).toBe(false);
    }
  });
});
