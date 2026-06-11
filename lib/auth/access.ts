import type { PrismaClient } from "@/lib/generated/prisma/client";
import type { Session } from "@/lib/auth/session";

export type Role = "owner" | "editor" | "viewer";

/** The session's effective role on a trip, or null if no access. */
export async function effectiveRole(prisma: PrismaClient, session: Session, tripId: string): Promise<Role | null> {
  const trip = await prisma.trip.findUnique({ where: { id: tripId }, select: { userId: true } });
  if (!trip) return null;
  if (trip.userId && trip.userId === session.userId) return "owner";
  const share = await prisma.tripShare.findUnique({
    where: { tripId_email: { tripId, email: session.email.toLowerCase() } },
    select: { role: true },
  });
  if (share?.role === "editor") return "editor";
  if (share?.role === "viewer") return "viewer";
  return null;
}

export type ResourceKind = "day" | "poi" | "group" | "via";

/** Resolve a nested resource id to its trip id (or null if it doesn't exist). */
export async function tripIdOf(prisma: PrismaClient, kind: ResourceKind, id: string): Promise<string | null> {
  switch (kind) {
    case "day": return (await prisma.day.findUnique({ where: { id }, select: { tripId: true } }))?.tripId ?? null;
    case "poi": return (await prisma.poi.findUnique({ where: { id }, select: { tripId: true } }))?.tripId ?? null;
    case "group": return (await prisma.poiGroup.findUnique({ where: { id }, select: { tripId: true } }))?.tripId ?? null;
    case "via": return (await prisma.routeVia.findUnique({ where: { id }, select: { tripId: true } }))?.tripId ?? null;
  }
}
