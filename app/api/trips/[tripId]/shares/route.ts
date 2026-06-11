import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { guardOwnerTrip } from "@/lib/auth/route-guards";
import { HttpError } from "@/lib/auth/guards";
import { listShares, upsertShare } from "@/lib/trips/shares";

type Ctx = { params: Promise<{ tripId: string }> };

const postSchema = z.object({ email: z.string(), role: z.enum(["viewer", "editor"]) });

export async function GET(_req: Request, { params }: Ctx) {
  const { tripId } = await params;
  const guard = await guardOwnerTrip(tripId);
  if (guard instanceof NextResponse) return guard;
  return NextResponse.json(await listShares(prisma, tripId));
}

export async function POST(req: Request, { params }: Ctx) {
  const { tripId } = await params;
  const guard = await guardOwnerTrip(tripId);
  if (guard instanceof NextResponse) return guard;
  const body = await req.json().catch(() => null);
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { email, role } = parsed.data;
  try {
    return NextResponse.json(await upsertShare(prisma, tripId, email, role), { status: 201 });
  } catch (e) {
    if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
