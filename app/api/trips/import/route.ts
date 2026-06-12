import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { importTrip } from "@/lib/trips/transfer";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  try {
    const { id } = await importTrip(prisma, body, session.userId);
    return NextResponse.json({ id }, { status: 201 });
  } catch (e) {
    if (e instanceof ZodError) return NextResponse.json({ error: "Invalid or unsupported trip file" }, { status: 400 });
    throw e;
  }
}
