import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { optimizeDay, ItineraryError } from "@/lib/itinerary/operations";
import { RouteError } from "@/lib/routing/routes";
import { guardWriteDay } from "@/lib/auth/route-guards";

type Ctx = { params: Promise<{ dayId: string }> };

export async function POST(_req: Request, { params }: Ctx) {
  const { dayId } = await params;
  const guard = await guardWriteDay(dayId);
  if (guard instanceof NextResponse) return guard;
  try {
    const pois = await optimizeDay(prisma, dayId);
    return NextResponse.json({ ok: true, count: pois.length });
  } catch (e) {
    if (e instanceof ItineraryError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    if (e instanceof RouteError) {
      return NextResponse.json({ error: e.message }, { status: 502 });
    }
    throw e;
  }
}
