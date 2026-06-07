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

  return <PlannerShell tripId={tripId} />;
}
