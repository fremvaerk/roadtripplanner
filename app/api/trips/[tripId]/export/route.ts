import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { requireRead, HttpError } from "@/lib/auth/guards";
import { loadTripGraph, serializeTrip } from "@/lib/trips/transfer";

type Ctx = { params: Promise<{ tripId: string }> };

function slug(s: string): string {
  return (s || "trip").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "trip";
}

export async function GET(_req: Request, { params }: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { tripId } = await params;
  try {
    await requireRead(prisma, session, tripId);
  } catch (e) {
    if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
  const graph = await loadTripGraph(prisma, tripId);
  if (!graph) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const data = serializeTrip(graph);
  return new NextResponse(JSON.stringify(data, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="trip-${slug(graph.title)}.json"`,
    },
  });
}
