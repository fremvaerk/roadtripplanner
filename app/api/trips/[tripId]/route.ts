import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getTrip, updateTrip, deleteTrip } from "@/lib/trips/service";
import { updateTripSchema } from "@/lib/trips/schema";

type Ctx = { params: Promise<{ tripId: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { tripId } = await params;
  const trip = await getTrip(prisma, tripId);
  if (!trip) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(trip);
}

export async function PATCH(req: Request, { params }: Ctx) {
  const { tripId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = updateTripSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const trip = await updateTrip(prisma, tripId, parsed.data);
  return NextResponse.json(trip);
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { tripId } = await params;
  await deleteTrip(prisma, tripId);
  return new NextResponse(null, { status: 204 });
}
