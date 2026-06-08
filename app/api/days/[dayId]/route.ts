import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { removeDay, ItineraryError } from "@/lib/itinerary/operations";

type Ctx = { params: Promise<{ dayId: string }> };

export async function DELETE(_req: Request, { params }: Ctx) {
  const { dayId } = await params;
  try {
    await removeDay(prisma, dayId);
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    if (e instanceof ItineraryError) {
      return NextResponse.json({ error: e.message }, { status: 404 });
    }
    throw e;
  }
}
