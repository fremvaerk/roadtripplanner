import type { PrismaClient } from "@/lib/generated/prisma/client";
import type { Session } from "@/lib/auth/session";
import { effectiveRole, tripIdOf, type ResourceKind, type Role } from "@/lib/auth/access";
import { getSession } from "@/lib/auth/session";

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); this.name = "HttpError"; }
}

/** Current session or throw 401. */
export async function requireSession(): Promise<Session> {
  const s = await getSession();
  if (!s) throw new HttpError(401, "Unauthorized");
  return s;
}

/** Any member (owner/editor/viewer) may read. Non-members get 404 (don't leak existence). */
export async function requireRead(prisma: PrismaClient, session: Session, tripId: string): Promise<Role> {
  const role = await effectiveRole(prisma, session, tripId);
  if (!role) throw new HttpError(404, "Not found");
  return role;
}

/** Owner/editor may write. Viewer → 403, non-member → 404. */
export async function requireWrite(prisma: PrismaClient, session: Session, tripId: string): Promise<Role> {
  const role = await effectiveRole(prisma, session, tripId);
  if (!role) throw new HttpError(404, "Not found");
  if (role === "viewer") throw new HttpError(403, "Read-only access");
  return role;
}

/** Owner only (delete trip, manage shares). */
export async function requireOwner(prisma: PrismaClient, session: Session, tripId: string): Promise<void> {
  const role = await effectiveRole(prisma, session, tripId);
  if (!role) throw new HttpError(404, "Not found");
  if (role !== "owner") throw new HttpError(403, "Owner only");
}

async function resolveOr404(prisma: PrismaClient, kind: ResourceKind, id: string): Promise<string> {
  const tripId = await tripIdOf(prisma, kind, id);
  if (!tripId) throw new HttpError(404, "Not found");
  return tripId;
}
export async function requireWriteForDay(prisma: PrismaClient, session: Session, dayId: string) { return requireWrite(prisma, session, await resolveOr404(prisma, "day", dayId)); }
export async function requireWriteForPoi(prisma: PrismaClient, session: Session, poiId: string) { return requireWrite(prisma, session, await resolveOr404(prisma, "poi", poiId)); }
export async function requireWriteForGroup(prisma: PrismaClient, session: Session, groupId: string) { return requireWrite(prisma, session, await resolveOr404(prisma, "group", groupId)); }
export async function requireWriteForVia(prisma: PrismaClient, session: Session, viaId: string) { return requireWrite(prisma, session, await resolveOr404(prisma, "via", viaId)); }
