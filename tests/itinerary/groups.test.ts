import { test, expect, describe, beforeEach, afterAll } from "bun:test";
import { PrismaClient } from "@/lib/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import {
  createGroup,
  renameGroup,
  deleteGroup,
  reorderGroups,
  addPoi,
  setGroupColor,
} from "@/lib/itinerary/operations";
import { createTrip } from "@/lib/trips/service";
import type { CreateTripData } from "@/lib/trips/schema";
import { updateGroupSchema } from "@/lib/itinerary/schema";
import { PALETTE } from "@/lib/places/group-colors";

const prisma = new PrismaClient({
  adapter: new PrismaLibSql({ url: process.env.DATABASE_URL ?? "file:./test.db" }),
});

beforeEach(async () => {
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

describe("group CRUD", () => {
  test("createGroup assigns sequential orderIndex", async () => {
    const trip = await createTrip(prisma, sampleTrip());
    const g0 = await createGroup(prisma, trip.id, "Wineries");
    const g1 = await createGroup(prisma, trip.id, "Sights");
    expect(g0.orderIndex).toBe(0);
    expect(g1.orderIndex).toBe(1);
  });

  test("renameGroup changes the name", async () => {
    const trip = await createTrip(prisma, sampleTrip());
    const g = await createGroup(prisma, trip.id, "Old");
    const r = await renameGroup(prisma, g.id, "New");
    expect(r.name).toBe("New");
  });

  test("deleteGroup reassigns its POIs to ungrouped (groupId null) and removes the group", async () => {
    const trip = await createTrip(prisma, sampleTrip());
    const g = await createGroup(prisma, trip.id, "Temp");
    const p = await addPoi(prisma, trip.id, { name: "P", lat: 1, lng: 1, groupId: g.id });
    await deleteGroup(prisma, g.id);
    expect(await prisma.poiGroup.findUnique({ where: { id: g.id } })).toBeNull();
    const fresh = await prisma.poi.findUnique({ where: { id: p.id } });
    expect(fresh?.groupId).toBeNull();
  });

  test("reorderGroups sets orderIndex from the given id order", async () => {
    const trip = await createTrip(prisma, sampleTrip());
    const a = await createGroup(prisma, trip.id, "A");
    const b = await createGroup(prisma, trip.id, "B");
    await reorderGroups(prisma, trip.id, [b.id, a.id]);
    expect((await prisma.poiGroup.findUnique({ where: { id: b.id } }))?.orderIndex).toBe(0);
    expect((await prisma.poiGroup.findUnique({ where: { id: a.id } }))?.orderIndex).toBe(1);
  });

  test("createGroup assigns the next palette color", async () => {
    const trip = await createTrip(prisma, sampleTrip());
    const g0 = await createGroup(prisma, trip.id, "A");
    const g1 = await createGroup(prisma, trip.id, "B");
    expect(g0.color).toBe(PALETTE[0]);
    expect(g1.color).toBe(PALETTE[1]);
  });

  test("setGroupColor updates the stored color", async () => {
    const trip = await createTrip(prisma, sampleTrip());
    const g = await createGroup(prisma, trip.id, "A");
    const updated = await setGroupColor(prisma, g.id, "#123456");
    expect(updated.color).toBe("#123456");
  });

  test("updateGroupSchema validates name and color", () => {
    expect(updateGroupSchema.safeParse({ name: "X" }).success).toBe(true);
    expect(updateGroupSchema.safeParse({ color: "#aabbcc" }).success).toBe(true);
    expect(updateGroupSchema.safeParse({ color: "red" }).success).toBe(false);
    expect(updateGroupSchema.safeParse({ color: "#abc" }).success).toBe(false);
    expect(updateGroupSchema.safeParse({}).success).toBe(false);
  });
});
