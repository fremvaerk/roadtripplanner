import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { listTrips } from "@/lib/trips/service";
import { getSession } from "@/lib/auth/session";
import { TripsList, type TripListItem } from "@/components/trips-list";
import { UserMenu } from "@/components/auth/user-menu";
import { ImportTripButton } from "@/components/import-trip-button";
import { NewTripButton } from "@/components/new-trip-button";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await getSession();
  if (!session) redirect("/signin");

  const trips = await listTrips(prisma, session);
  const items: TripListItem[] = trips.map((t) => ({
    id: t.id,
    title: t.title,
    startName: t.startName,
    endName: t.endName,
    isRoundTrip: t.isRoundTrip,
    archivedAt: t.archivedAt ? t.archivedAt.toISOString() : null,
    role: t.role,
    coverImage: t.coverImage,
    dayCount: t.dayCount,
    poiCount: t.poiCount,
    driveSeconds: t.driveSeconds ?? null,
    driveMeters: t.driveMeters ?? null,
  }));

  return (
    <main className="mx-auto max-w-3xl p-4 sm:p-8">
      <header className="mb-8 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Your road trips</h1>
        <div className="flex items-center gap-2">
          <ImportTripButton />
          <NewTripButton />
          <div className="ml-1">
            <UserMenu session={session} />
          </div>
        </div>
      </header>

      <TripsList trips={items} />
    </main>
  );
}
