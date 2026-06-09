import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { renameGroup, setGroupColor, deleteGroup } from "@/lib/itinerary/operations";
import { updateGroupSchema } from "@/lib/itinerary/schema";

type Ctx = { params: Promise<{ groupId: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const { groupId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = updateGroupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  let group = null;
  if (parsed.data.name !== undefined) group = await renameGroup(prisma, groupId, parsed.data.name);
  if (parsed.data.color !== undefined) group = await setGroupColor(prisma, groupId, parsed.data.color);
  if (!group) group = await prisma.poiGroup.findUnique({ where: { id: groupId } });
  return NextResponse.json(group);
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { groupId } = await params;
  await deleteGroup(prisma, groupId);
  return new NextResponse(null, { status: 204 });
}
