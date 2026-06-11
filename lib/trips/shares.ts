import type { PrismaClient } from "@/lib/generated/prisma/client";
import { HttpError } from "@/lib/auth/guards";

const ROLES = ["viewer", "editor"] as const;
export type ShareRole = (typeof ROLES)[number];
export function isShareRole(r: string): r is ShareRole {
  return (ROLES as readonly string[]).includes(r);
}

export async function listShares(prisma: PrismaClient, tripId: string) {
  return prisma.tripShare.findMany({ where: { tripId }, orderBy: { createdAt: "asc" } });
}

export async function upsertShare(prisma: PrismaClient, tripId: string, emailRaw: string, role: string) {
  if (!isShareRole(role)) throw new HttpError(400, "Invalid role");
  const email = emailRaw.trim().toLowerCase();
  if (!email || !email.includes("@")) throw new HttpError(400, "Invalid email");
  // Don't let the owner share with themselves.
  const trip = await prisma.trip.findUnique({ where: { id: tripId }, select: { userId: true } });
  if (trip?.userId) {
    const owner = await prisma.user.findUnique({ where: { id: trip.userId }, select: { email: true } });
    if (owner && owner.email.toLowerCase() === email) throw new HttpError(400, "You already own this trip");
  }
  return prisma.tripShare.upsert({
    where: { tripId_email: { tripId, email } },
    update: { role },
    create: { tripId, email, role },
  });
}

export async function setShareRole(prisma: PrismaClient, tripId: string, shareId: string, role: string) {
  if (!isShareRole(role)) throw new HttpError(400, "Invalid role");
  const share = await prisma.tripShare.findUnique({ where: { id: shareId }, select: { tripId: true } });
  if (!share || share.tripId !== tripId) throw new HttpError(404, "Not found");
  return prisma.tripShare.update({ where: { id: shareId }, data: { role } });
}

export async function removeShare(prisma: PrismaClient, tripId: string, shareId: string) {
  // ensure the share belongs to this trip before deleting
  const share = await prisma.tripShare.findUnique({ where: { id: shareId }, select: { tripId: true } });
  if (!share || share.tripId !== tripId) throw new HttpError(404, "Not found");
  await prisma.tripShare.delete({ where: { id: shareId } });
}
