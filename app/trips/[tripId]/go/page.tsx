import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getTrip } from "@/lib/trips/service";
import { getSession } from "@/lib/auth/session";
import { NavCompanion } from "@/components/mobile/nav-companion";

export const dynamic = "force-dynamic";

export default async function TripGoPage({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;
  const session = await getSession();
  if (!session) redirect("/signin");

  const trip = await getTrip(prisma, tripId, session);
  if (!trip) notFound();

  return <NavCompanion tripId={tripId} role={trip.role} />;
}
