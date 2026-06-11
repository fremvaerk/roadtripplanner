import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { setNight, updateNight, clearNight, ItineraryError } from "@/lib/itinerary/operations";
import { setNightSchema, updateNightSchema } from "@/lib/itinerary/schema";
import { guardWriteDay } from "@/lib/auth/route-guards";

type Ctx = { params: Promise<{ dayId: string }> };

export async function POST(req: Request, { params }: Ctx) {
  const { dayId } = await params;
  const guard = await guardWriteDay(dayId);
  if (guard instanceof NextResponse) return guard;
  const body = await req.json().catch(() => null);
  const parsed = setNightSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const night = await setNight(prisma, dayId, parsed.data);
  return NextResponse.json(night, { status: 201 });
}

export async function PATCH(req: Request, { params }: Ctx) {
  const { dayId } = await params;
  const guard = await guardWriteDay(dayId);
  if (guard instanceof NextResponse) return guard;
  const body = await req.json().catch(() => null);
  const parsed = updateNightSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const night = await updateNight(prisma, dayId, parsed.data);
    return NextResponse.json(night);
  } catch (e) {
    if (e instanceof ItineraryError) {
      return NextResponse.json({ error: e.message }, { status: 404 });
    }
    throw e;
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { dayId } = await params;
  const guard = await guardWriteDay(dayId);
  if (guard instanceof NextResponse) return guard;
  await clearNight(prisma, dayId);
  return new NextResponse(null, { status: 204 });
}
