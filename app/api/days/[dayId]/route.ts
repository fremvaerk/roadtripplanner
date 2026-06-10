import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { removeDay, setDayColor, ItineraryError } from "@/lib/itinerary/operations";
import { updateDaySchema } from "@/lib/itinerary/schema";

type Ctx = { params: Promise<{ dayId: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const { dayId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = updateDaySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const exists = await prisma.day.findUnique({ where: { id: dayId }, select: { id: true } });
  if (!exists) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const day = await setDayColor(prisma, dayId, parsed.data.color);
  return NextResponse.json(day);
}

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
