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
    <main className="mx-auto max-w-3xl p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Your road trips</h1>
        <div className="flex items-center gap-4">
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
