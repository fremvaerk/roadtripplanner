import { test, expect, describe, beforeEach, afterAll } from "bun:test";
import { prisma } from "@/lib/db";
import { HttpError } from "@/lib/auth/guards";
import {
  listShares,
  upsertShare,
  setShareRole,
  removeShare,
  isShareRole,
} from "@/lib/trips/shares";

beforeEach(async () => {
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

async function seedTrip() {
  const owner = await prisma.user.create({ data: { email: "owner@x.com" } });
  const trip = await prisma.trip.create({
    data: {
      userId: owner.id,
      title: "T",
      startName: "S",
      startLat: 0,
      startLng: 0,
      description: "",
    },
  });
  return { owner, trip };
}

describe("isShareRole", () => {
  test("true for valid, false for invalid", () => {
    expect(isShareRole("viewer")).toBe(true);
    expect(isShareRole("editor")).toBe(true);
    expect(isShareRole("owner")).toBe(false);
    expect(isShareRole("")).toBe(false);
  });
});

describe("listShares", () => {
  test("empty then reflects added shares", async () => {
    const { trip } = await seedTrip();
    expect(await listShares(prisma, trip.id)).toEqual([]);
    await upsertShare(prisma, trip.id, "a@x.com", "viewer");
    await upsertShare(prisma, trip.id, "b@x.com", "editor");
    const shares = await listShares(prisma, trip.id);
    expect(shares.length).toBe(2);
    expect(shares.map((s) => s.email)).toEqual(["a@x.com", "b@x.com"]);
  });
});

describe("upsertShare", () => {
  test("creates then updates role for the same email (one row, role changed)", async () => {
    const { trip } = await seedTrip();
    const created = await upsertShare(prisma, trip.id, "a@x.com", "viewer");
    expect(created.role).toBe("viewer");
    const updated = await upsertShare(prisma, trip.id, "a@x.com", "editor");
    expect(updated.role).toBe("editor");
    const shares = await listShares(prisma, trip.id);
    expect(shares.length).toBe(1);
    expect(shares[0].role).toBe("editor");
  });

  test("normalizes email (trim + lowercase)", async () => {
    const { trip } = await seedTrip();
    const created = await upsertShare(prisma, trip.id, "  A@X.com ", "viewer");
    expect(created.email).toBe("a@x.com");
  });

  test("rejects invalid role with 400", async () => {
    const { trip } = await seedTrip();
    await expectStatus(() => upsertShare(prisma, trip.id, "a@x.com", "owner"), 400);
  });

  test("rejects invalid email with 400", async () => {
    const { trip } = await seedTrip();
    await expectStatus(() => upsertShare(prisma, trip.id, "not-an-email", "viewer"), 400);
  });

  test("rejects sharing with the owner's own email with 400", async () => {
    const { trip } = await seedTrip();
    await expectStatus(() => upsertShare(prisma, trip.id, "owner@x.com", "viewer"), 400);
  });
});

describe("setShareRole", () => {
  test("updates the role", async () => {
    const { trip } = await seedTrip();
    const share = await upsertShare(prisma, trip.id, "a@x.com", "viewer");
    const updated = await setShareRole(prisma, trip.id, share.id, "editor");
    expect(updated.role).toBe("editor");
  });

  test("rejects invalid role with 400", async () => {
    const { trip } = await seedTrip();
    const share = await upsertShare(prisma, trip.id, "a@x.com", "viewer");
    await expectStatus(() => setShareRole(prisma, trip.id, share.id, "owner"), 400);
  });

  test("a share from another trip → 404", async () => {
    const { trip } = await seedTrip();
    const owner2 = await prisma.user.create({ data: { email: "owner2@x.com" } });
    const trip2 = await prisma.trip.create({
      data: { userId: owner2.id, title: "T2", startName: "S", startLat: 0, startLng: 0, description: "" },
    });
    const share = await upsertShare(prisma, trip2.id, "a@x.com", "viewer");
    await expectStatus(() => setShareRole(prisma, trip.id, share.id, "editor"), 404);
  });
});

describe("removeShare", () => {
  test("deletes the share", async () => {
    const { trip } = await seedTrip();
    const share = await upsertShare(prisma, trip.id, "a@x.com", "viewer");
    await removeShare(prisma, trip.id, share.id);
    expect(await listShares(prisma, trip.id)).toEqual([]);
  });

  test("a share from another trip → 404", async () => {
    const { trip } = await seedTrip();
    const owner2 = await prisma.user.create({ data: { email: "owner2@x.com" } });
    const trip2 = await prisma.trip.create({
      data: { userId: owner2.id, title: "T2", startName: "S", startLat: 0, startLng: 0, description: "" },
    });
    const share = await upsertShare(prisma, trip2.id, "a@x.com", "viewer");
    await expectStatus(() => removeShare(prisma, trip.id, share.id), 404);
  });
});
