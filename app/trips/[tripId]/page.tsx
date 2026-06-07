import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getTrip } from "@/lib/trips/service";
import { PlannerShell } from "@/components/planner-shell";

export const dynamic = "force-dynamic";

export default async function TripPage({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;
  const trip = await getTrip(prisma, tripId);
  if (!trip) notFound();

  return (
    <PlannerShell
      trip={{
        id: trip.id,
        title: trip.title,
        startName: trip.startName,
        startLat: trip.startLat,
        startLng: trip.startLng,
        endName: trip.endName,
        endLat: trip.endLat,
        endLng: trip.endLng,
        isRoundTrip: trip.isRoundTrip,
        days: trip.days.map((d) => ({
          id: d.id,
          dayIndex: d.dayIndex,
          pois: d.pois.map((p) => ({ id: p.id, name: p.name })),
        })),
        pois: trip.pois.map((p) => ({ id: p.id, name: p.name, lat: p.lat, lng: p.lng })),
      }}
    />
  );
}
