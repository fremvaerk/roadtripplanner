import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { guardOwnerTrip } from "@/lib/auth/route-guards";
import { HttpError } from "@/lib/auth/guards";
import { setShareRole, removeShare } from "@/lib/trips/shares";

type Ctx = { params: Promise<{ tripId: string; shareId: string }> };

const patchSchema = z.object({ role: z.enum(["viewer", "editor"]) });

export async function PATCH(req: Request, { params }: Ctx) {
  const { tripId, shareId } = await params;
  const guard = await guardOwnerTrip(tripId);
  if (guard instanceof NextResponse) return guard;
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  try {
    return NextResponse.json(await setShareRole(prisma, tripId, shareId, parsed.data.role));
  } catch (e) {
    if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { tripId, shareId } = await params;
  const guard = await guardOwnerTrip(tripId);
  if (guard instanceof NextResponse) return guard;
  try {
    await removeShare(prisma, tripId, shareId);
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
