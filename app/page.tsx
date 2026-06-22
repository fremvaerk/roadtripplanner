import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { listTrips } from "@/lib/trips/service";
import { getSession } from "@/lib/auth/session";
import { Button } from "@/components/ui/button";
import { TripsList, type TripListItem } from "@/components/trips-list";
import { UserMenu } from "@/components/auth/user-menu";
import { ImportTripButton } from "@/components/import-trip-button";

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
  }));

  return (
    <main className="mx-auto max-w-3xl p-4 sm:p-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Your road trips</h1>
        <div className="flex flex-wrap items-center gap-2 sm:gap-4">
          <UserMenu session={session} />
          <ImportTripButton />
          <Button asChild>
            <Link href="/trips/new">New trip</Link>
          </Button>
        </div>
      </div>

      <TripsList trips={items} />
    </main>
  );
}
