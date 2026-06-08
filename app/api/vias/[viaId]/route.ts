import { NextResponse } from "next/server";
import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/db";
import { moveVia, removeVia } from "@/lib/itinerary/operations";
import { moveViaSchema } from "@/lib/itinerary/schema";

type Ctx = { params: Promise<{ viaId: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const { viaId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = moveViaSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const via = await moveVia(prisma, viaId, parsed.data);
    return NextResponse.json(via);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    throw e;
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { viaId } = await params;
  try {
    await removeVia(prisma, viaId);
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    throw e;
  }
}
