import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createGroup, reorderGroups } from "@/lib/itinerary/operations";
import { createGroupSchema, reorderGroupsSchema } from "@/lib/itinerary/schema";

type Ctx = { params: Promise<{ tripId: string }> };

export async function POST(req: Request, { params }: Ctx) {
  const { tripId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = createGroupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const group = await createGroup(prisma, tripId, parsed.data.name);
  return NextResponse.json(group, { status: 201 });
}

export async function PUT(req: Request, { params }: Ctx) {
  const { tripId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = reorderGroupsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  await reorderGroups(prisma, tripId, parsed.data.orderedIds);
  return NextResponse.json({ ok: true });
}
