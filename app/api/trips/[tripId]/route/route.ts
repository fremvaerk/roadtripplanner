import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getTrip } from "@/lib/trips/service";
import { computeRouteChunked, RouteError } from "@/lib/routing/routes";
import { buildDayRouteRequests, attributeLegDurations, type TripVia } from "@/lib/routing/itinerary-route";
import type { RouteLegResult, TripDetail } from "@/lib/api/trips";

type Ctx = { params: Promise<{ tripId: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { tripId } = await params;
  const trip = await getTrip(prisma, tripId);
  if (!trip) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const vias = ((trip as unknown as { routeVias?: TripVia[] }).routeVias ?? []) as TripVia[];
  const segments = buildDayRouteRequests(trip as unknown as TripDetail, vias);

  if (segments.length === 0) {
    return NextResponse.json({ legs: [], perDaySeconds: {}, perDayMeters: {}, totalSeconds: 0, totalMeters: 0, failedDayIds: [] });
  }

  const results = await Promise.allSettled(
    segments.map((seg) => computeRouteChunked(seg.waypoints, undefined, { legPolylines: true })),
  );

  const legs: RouteLegResult[] = [];
  const legDayIdAll: (string | null)[] = [];
  const legSeconds: number[] = [];
  const legMeters: number[] = [];
  const failed = new Set<string>();

  results.forEach((res, i) => {
    const seg = segments[i];
    if (res.status === "fulfilled") {
      // Each leg must line up 1:1 with the segment's stopover legs. If Google ever
      // returns a different count, attribution is impossible — fail the day cleanly
      // rather than silently mislabel legs.
      if (res.value.length !== seg.legDayId.length) {
        for (const d of seg.legDayId) if (d) failed.add(d);
        return;
      }
      res.value.forEach((leg, j) => {
        legs.push({
          encodedPolyline: leg.encodedPolyline ?? null,
          afterPoiId: seg.legAfterPoiId[j] ?? null,
          dayId: seg.legDayId[j] ?? null,
          durationSeconds: leg.durationSeconds,
          distanceMeters: leg.distanceMeters,
        });
        legDayIdAll.push(seg.legDayId[j] ?? null);
        legSeconds.push(leg.durationSeconds);
        legMeters.push(leg.distanceMeters);
      });
    } else {
      if (!(res.reason instanceof RouteError)) throw res.reason;
      for (const d of seg.legDayId) if (d) failed.add(d);
    }
  });

  const { perDaySeconds, perDayMeters, totalSeconds, totalMeters } = attributeLegDurations(
    legDayIdAll, legSeconds, legMeters,
  );

  return NextResponse.json({
    legs, perDaySeconds, perDayMeters, totalSeconds, totalMeters,
    failedDayIds: [...failed],
  });
}
