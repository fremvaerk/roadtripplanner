import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createTripSchema } from "@/lib/trips/schema";
import { createTrip, listTrips } from "@/lib/trips/service";
import { geocodePlace, GeocodeError } from "@/lib/geocode";

export async function GET() {
  const trips = await listTrips(prisma);
  return NextResponse.json(trips);
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = createTripSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;

  try {
    const start = await geocodePlace(input.startName);
    const end =
      !input.isRoundTrip && input.endName ? await geocodePlace(input.endName) : null;

    const trip = await createTrip(prisma, {
      title: input.title,
      description: input.description,
      isRoundTrip: input.isRoundTrip,
      startDate: input.startDate ? new Date(input.startDate) : null,
      dayCount: input.dayCount,
      start,
      end,
    });
    return NextResponse.json(trip, { status: 201 });
  } catch (e) {
    if (e instanceof GeocodeError) {
      return NextResponse.json({ error: e.message }, { status: 422 });
    }
    throw e;
  }
}
