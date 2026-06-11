import { test, expect, describe, beforeEach, afterAll } from "bun:test";
import { prisma } from "@/lib/db";
import type { Session } from "@/lib/auth/session";
import { effectiveRole } from "@/lib/auth/access";
import {
  HttpError,
  requireRead,
  requireWrite,
  requireOwner,
  requireWriteForDay,
} from "@/lib/auth/guards";

beforeEach(async () => {
  await prisma.nightStop.deleteMany();
  await prisma.routeVia.deleteMany();
  await prisma.poi.deleteMany();
  await prisma.poiGroup.deleteMany();
  await prisma.day.deleteMany();
  await prisma.tripShare.deleteMany();
  await prisma.trip.deleteMany();
  await prisma.user.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

/** Assert that awaiting `fn` throws an HttpError with the given status. */
async function expectStatus(fn: () => Promise<unknown>, status: number) {
  try {
    await fn();
  } catch (e) {
    expect(e instanceof HttpError && e.status === status).toBe(true);
    return;
  }
  throw new Error(`expected HttpError ${status} but nothing was thrown`);
}

async function seed() {
  const a = await prisma.user.create({ data: { email: "a@x.com" } });
  const b = await prisma.user.create({ data: { email: "b@x.com" } });
  const c = await prisma.user.create({ data: { email: "c@x.com" } });

  const trip = await prisma.trip.create({
    data: {
      userId: a.id,
      title: "T",
      startName: "S",
      startLat: 0,
      startLng: 0,
      description: "",
    },
  });

  await prisma.tripShare.create({ data: { tripId: trip.id, email: "b@x.com", role: "viewer" } });
  await prisma.tripShare.create({ data: { tripId: trip.id, email: "c@x.com", role: "editor" } });

  const sessionA: Session = { userId: a.id, email: "a@x.com" };
  const sessionB: Session = { userId: b.id, email: "b@x.com" };
  const sessionC: Session = { userId: c.id, email: "c@x.com" };
  const stranger: Session = { userId: "zzz", email: "z@x.com" };

  return { trip, sessionA, sessionB, sessionC, stranger };
}

describe("effectiveRole", () => {
  test("resolves owner/viewer/editor and null for strangers and unknown trips", async () => {
    const { trip, sessionA, sessionB, sessionC, stranger } = await seed();
    expect(await effectiveRole(prisma, sessionA, trip.id)).toBe("owner");
    expect(await effectiveRole(prisma, sessionB, trip.id)).toBe("viewer");
    expect(await effectiveRole(prisma, sessionC, trip.id)).toBe("editor");
    expect(await effectiveRole(prisma, stranger, trip.id)).toBeNull();
    expect(await effectiveRole(prisma, sessionA, "nope")).toBeNull();
  });
});

describe("requireRead", () => {
  test("any member may read; non-members and unknown trips → 404", async () => {
    const { trip, sessionA, sessionB, sessionC, stranger } = await seed();
    expect(await requireRead(prisma, sessionA, trip.id)).toBe("owner");
    expect(await requireRead(prisma, sessionB, trip.id)).toBe("viewer");
    expect(await requireRead(prisma, sessionC, trip.id)).toBe("editor");
    await expectStatus(() => requireRead(prisma, stranger, trip.id), 404);
    await expectStatus(() => requireRead(prisma, sessionA, "nope"), 404);
  });
});

describe("requireWrite", () => {
  test("owner/editor may write; viewer → 403; stranger → 404", async () => {
    const { trip, sessionA, sessionB, sessionC, stranger } = await seed();
    expect(await requireWrite(prisma, sessionA, trip.id)).toBe("owner");
    expect(await requireWrite(prisma, sessionC, trip.id)).toBe("editor");
    await expectStatus(() => requireWrite(prisma, sessionB, trip.id), 403);
    await expectStatus(() => requireWrite(prisma, stranger, trip.id), 404);
  });
});

describe("requireOwner", () => {
  test("owner only; editor and viewer → 403; stranger → 404", async () => {
    const { trip, sessionA, sessionB, sessionC, stranger } = await seed();
    await requireOwner(prisma, sessionA, trip.id); // resolves
    await expectStatus(() => requireOwner(prisma, sessionC, trip.id), 403);
    await expectStatus(() => requireOwner(prisma, sessionB, trip.id), 403);
    await expectStatus(() => requireOwner(prisma, stranger, trip.id), 404);
  });
});

describe("requireWriteForDay (tripIdOf resolution)", () => {
  test("editor ok, viewer 403, unknown day 404", async () => {
    const { trip, sessionA, sessionB, sessionC } = await seed();
    const day = await prisma.day.create({ data: { tripId: trip.id, dayIndex: 0 } });

    expect(await requireWriteForDay(prisma, sessionC, day.id)).toBe("editor");
    await expectStatus(() => requireWriteForDay(prisma, sessionB, day.id), 403);
    await expectStatus(() => requireWriteForDay(prisma, sessionA, "nope"), 404);
  });
});
