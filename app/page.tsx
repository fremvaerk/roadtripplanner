import Link from "next/link";
import { prisma } from "@/lib/db";
import { listTrips } from "@/lib/trips/service";
import { Button } from "@/components/ui/button";
import { TripsList, type TripListItem } from "@/components/trips-list";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const trips = await listTrips(prisma);
  const items: TripListItem[] = trips.map((t) => ({
    id: t.id,
    title: t.title,
    startName: t.startName,
    endName: t.endName,
    isRoundTrip: t.isRoundTrip,
    archivedAt: t.archivedAt ? t.archivedAt.toISOString() : null,
  }));

  return (
    <main className="mx-auto max-w-3xl p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Your road trips</h1>
        <Button asChild>
          <Link href="/trips/new">New trip</Link>
        </Button>
      </div>

      <TripsList trips={items} />
    </main>
  );
}
