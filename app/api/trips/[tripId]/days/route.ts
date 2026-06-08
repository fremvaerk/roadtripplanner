import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { addDay } from "@/lib/itinerary/operations";

type Ctx = { params: Promise<{ tripId: string }> };

export async function POST(_req: Request, { params }: Ctx) {
  const { tripId } = await params;
  const day = await addDay(prisma, tripId);
  return NextResponse.json(day, { status: 201 });
}
