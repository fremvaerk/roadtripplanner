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
export async function requireRead(session: Session, tripId: string): Promise<Role> {
  const role = await effectiveRole(session, tripId);
  if (!role) throw new HttpError(404, "Not found");
  return role;
}

/** Owner/editor may write. Viewer → 403, non-member → 404. */
export async function requireWrite(session: Session, tripId: string): Promise<Role> {
  const role = await effectiveRole(session, tripId);
  if (!role) throw new HttpError(404, "Not found");
  if (role === "viewer") throw new HttpError(403, "Read-only access");
  return role;
}

/** Owner only (delete trip, manage shares). */
export async function requireOwner(session: Session, tripId: string): Promise<void> {
  const role = await effectiveRole(session, tripId);
  if (!role) throw new HttpError(404, "Not found");
  if (role !== "owner") throw new HttpError(403, "Owner only");
}

async function resolveOr404(kind: ResourceKind, id: string): Promise<string> {
  const tripId = await tripIdOf(kind, id);
  if (!tripId) throw new HttpError(404, "Not found");
  return tripId;
}
export async function requireWriteForDay(session: Session, dayId: string) { return requireWrite(session, await resolveOr404("day", dayId)); }
export async function requireWriteForPoi(session: Session, poiId: string) { return requireWrite(session, await resolveOr404("poi", poiId)); }
export async function requireWriteForGroup(session: Session, groupId: string) { return requireWrite(session, await resolveOr404("group", groupId)); }
export async function requireWriteForVia(session: Session, viaId: string) { return requireWrite(session, await resolveOr404("via", viaId)); }
