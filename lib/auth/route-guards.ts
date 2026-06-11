import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession, type Session } from "@/lib/auth/session";
import { HttpError, requireWrite, requireWriteForDay, requireWriteForPoi, requireWriteForGroup, requireWriteForVia, requireOwner } from "@/lib/auth/guards";

async function run(check: (session: Session) => Promise<unknown>): Promise<NextResponse | Session> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await check(session);
    return session;
  } catch (e) {
    if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}

export const guardWriteTrip = (tripId: string) => run((s) => requireWrite(prisma, s, tripId));
export const guardOwnerTrip = (tripId: string) => run((s) => requireOwner(prisma, s, tripId));
export const guardWriteDay = (dayId: string) => run((s) => requireWriteForDay(prisma, s, dayId));
export const guardWritePoi = (poiId: string) => run((s) => requireWriteForPoi(prisma, s, poiId));
export const guardWriteGroup = (groupId: string) => run((s) => requireWriteForGroup(prisma, s, groupId));
export const guardWriteVia = (viaId: string) => run((s) => requireWriteForVia(prisma, s, viaId));
