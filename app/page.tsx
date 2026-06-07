import Link from "next/link";
import { prisma } from "@/lib/db";
import { listTrips } from "@/lib/trips/service";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const trips = await listTrips(prisma);

  return (
    <main className="mx-auto max-w-3xl p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Your road trips</h1>
        <Button asChild>
          <Link href="/trips/new">New trip</Link>
        </Button>
      </div>

      {trips.length === 0 ? (
        <p className="text-muted-foreground">No trips yet. Create your first one.</p>
      ) : (
        <ul className="space-y-2">
          {trips.map((t) => (
            <li key={t.id}>
              <Link
                href={`/trips/${t.id}`}
                className="block rounded-md border p-4 hover:bg-accent"
              >
                <div className="font-medium">{t.title}</div>
                <div className="text-sm text-muted-foreground">
                  {t.startName}
                  {t.endName ? ` → ${t.endName}` : " (round trip)"}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
