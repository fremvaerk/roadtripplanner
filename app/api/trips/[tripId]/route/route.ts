import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getTrip } from "@/lib/trips/service";
import { computeRoute, RouteError } from "@/lib/routing/routes";
import { buildRoute, attributeLegDurations, type TripVia } from "@/lib/routing/itinerary-route";
import type { TripDetail } from "@/lib/api/trips";

type Ctx = { params: Promise<{ tripId: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { tripId } = await params;
  const trip = await getTrip(prisma, tripId);
  if (!trip) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const vias = ((trip as unknown as { routeVias?: TripVia[] }).routeVias ?? []) as TripVia[];
  const { waypoints, legDayId, legAfterPoiId } = buildRoute(trip as unknown as TripDetail, vias);

  if (waypoints.length < 2) {
    return NextResponse.json({ legs: [], perDaySeconds: {}, perDayMeters: {}, totalSeconds: 0, totalMeters: 0 });
  }

  try {
    const route = await computeRoute(waypoints, undefined, { legPolylines: true });
    const { perDaySeconds, perDayMeters, totalSeconds, totalMeters } = attributeLegDurations(
      legDayId,
      route.legs.map((l) => l.durationSeconds),
      route.legs.map((l) => l.distanceMeters),
    );
    return NextResponse.json({
      legs: route.legs.map((l, i) => ({
        encodedPolyline: l.encodedPolyline ?? null,
        afterPoiId: legAfterPoiId[i] ?? null,
      })),
      perDaySeconds,
      perDayMeters,
      totalSeconds: totalSeconds || route.totalDurationSeconds,
      totalMeters: totalMeters || route.totalDistanceMeters,
    });
  } catch (e) {
    if (e instanceof RouteError) {
      return NextResponse.json({ error: e.message }, { status: 502 });
    }
    throw e;
  }
}
