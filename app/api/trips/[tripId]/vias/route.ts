import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { addVia, ItineraryError } from "@/lib/itinerary/operations";
import { addViaSchema } from "@/lib/itinerary/schema";
import { guardWriteTrip } from "@/lib/auth/route-guards";

type Ctx = { params: Promise<{ tripId: string }> };

export async function POST(req: Request, { params }: Ctx) {
  const { tripId } = await params;
  const guard = await guardWriteTrip(tripId);
  if (guard instanceof NextResponse) return guard;
  const body = await req.json().catch(() => null);
  const parsed = addViaSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const via = await addVia(prisma, tripId, parsed.data);
    return NextResponse.json(via, { status: 201 });
  } catch (e) {
    if (e instanceof ItineraryError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }
}
