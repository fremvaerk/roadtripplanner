import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getTrip } from "@/lib/trips/service";
import { computeRoute, RouteError } from "@/lib/routing/routes";
import { orderedRoutePoints, attributeLegDurations } from "@/lib/routing/itinerary-route";
import type { TripDetail } from "@/lib/api/trips";

type Ctx = { params: Promise<{ tripId: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { tripId } = await params;
  const trip = await getTrip(prisma, tripId);
  if (!trip) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { coords, legDayId } = orderedRoutePoints(trip as unknown as TripDetail);
  if (coords.length < 2) {
    return NextResponse.json({
      encodedPolyline: null,
      perDaySeconds: {},
      totalSeconds: 0,
      totalMeters: 0,
    });
  }

  try {
    const route = await computeRoute(coords);
    const { perDaySeconds, totalSeconds } = attributeLegDurations(
      legDayId,
      route.legs.map((l) => l.durationSeconds),
    );
    return NextResponse.json({
      encodedPolyline: route.encodedPolyline,
      perDaySeconds,
      totalSeconds: totalSeconds || route.totalDurationSeconds,
      totalMeters: route.totalDistanceMeters,
    });
  } catch (e) {
    if (e instanceof RouteError) {
      return NextResponse.json({ error: e.message }, { status: 502 });
    }
    throw e;
  }
}
