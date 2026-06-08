import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { splitPoolIntoDays } from "@/lib/itinerary/split-trip";
import { RouteError } from "@/lib/routing/routes";

type Ctx = { params: Promise<{ tripId: string }> };

export async function POST(_req: Request, { params }: Ctx) {
  const { tripId } = await params;
  try {
    await splitPoolIntoDays(prisma, tripId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof RouteError) {
      return NextResponse.json({ error: e.message }, { status: 502 });
    }
    throw e;
  }
}
