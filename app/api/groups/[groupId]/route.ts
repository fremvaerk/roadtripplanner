import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { renameGroup, setGroupColor, deleteGroup } from "@/lib/itinerary/operations";
import { updateGroupSchema } from "@/lib/itinerary/schema";
import { guardWriteGroup } from "@/lib/auth/route-guards";

type Ctx = { params: Promise<{ groupId: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const { groupId } = await params;
  const guard = await guardWriteGroup(groupId);
  if (guard instanceof NextResponse) return guard;
  const body = await req.json().catch(() => null);
  const parsed = updateGroupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const exists = await prisma.poiGroup.findUnique({ where: { id: groupId }, select: { id: true } });
  if (!exists) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (parsed.data.name !== undefined) await renameGroup(prisma, groupId, parsed.data.name);
  if (parsed.data.color !== undefined) await setGroupColor(prisma, groupId, parsed.data.color);
  const group = await prisma.poiGroup.findUnique({ where: { id: groupId } });
  return NextResponse.json(group);
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { groupId } = await params;
  const guard = await guardWriteGroup(groupId);
  if (guard instanceof NextResponse) return guard;
  await deleteGroup(prisma, groupId);
  return new NextResponse(null, { status: 204 });
}
