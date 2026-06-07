import { NextResponse } from "next/server";
import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/db";
import { removePoi } from "@/lib/itinerary/operations";

type Ctx = { params: Promise<{ poiId: string }> };

export async function DELETE(_req: Request, { params }: Ctx) {
  const { poiId } = await params;
  try {
    await removePoi(prisma, poiId);
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    throw e;
  }
}
