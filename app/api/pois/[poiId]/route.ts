import { NextResponse } from "next/server";
import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/db";
import { removePoi, movePoi, moveToGroup, updatePoi, ItineraryError } from "@/lib/itinerary/operations";
import { patchPoiSchema } from "@/lib/itinerary/schema";

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

export async function PATCH(req: Request, { params }: Ctx) {
  const { poiId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = patchPoiSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;
  try {
    let poi;
    if (data.op === "move") {
      poi = await movePoi(prisma, poiId, { dayId: data.dayId, orderInDay: data.orderInDay });
    } else if (data.op === "group") {
      poi = await moveToGroup(prisma, poiId, data.groupId, data.orderInGroup);
    } else if (data.op === "edit") {
      poi = await updatePoi(prisma, poiId, {
        name: data.name,
        description: data.description,
        imageUrl: data.imageUrl,
      });
    } else {
      data satisfies never;
      throw new Error(`Unhandled poi PATCH op`);
    }
    return NextResponse.json(poi);
  } catch (e) {
    if (e instanceof ItineraryError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    throw e;
  }
}
