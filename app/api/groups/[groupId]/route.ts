import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { renameGroup, deleteGroup } from "@/lib/itinerary/operations";
import { renameGroupSchema } from "@/lib/itinerary/schema";

type Ctx = { params: Promise<{ groupId: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const { groupId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = renameGroupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const group = await renameGroup(prisma, groupId, parsed.data.name);
  return NextResponse.json(group);
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { groupId } = await params;
  await deleteGroup(prisma, groupId);
  return new NextResponse(null, { status: 204 });
}
