import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { addDay, insertDayAfter, ItineraryError } from "@/lib/itinerary/operations";

type Ctx = { params: Promise<{ tripId: string }> };

export async function POST(req: Request, { params }: Ctx) {
  const { tripId } = await params;
  const body = await req.json().catch(() => null);
  const afterDayId = body?.afterDayId;
  try {
    const day =
      typeof afterDayId === "string"
        ? await insertDayAfter(prisma, tripId, afterDayId)
        : await addDay(prisma, tripId);
    return NextResponse.json(day, { status: 201 });
  } catch (e) {
    if (e instanceof ItineraryError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }
}
