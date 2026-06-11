import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getTrip } from "@/lib/trips/service";
import { getSession } from "@/lib/auth/session";
import { PlannerShell } from "@/components/planner-shell";

export const dynamic = "force-dynamic";

export default async function TripPage({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;
  const session = await getSession();
  if (!session) redirect("/signin");

  const trip = await getTrip(prisma, tripId, session);
  if (!trip) notFound();

  return <PlannerShell tripId={tripId} role={trip.role} />;
}
