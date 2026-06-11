import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { TripForm } from "@/components/trip-form";

export default async function NewTripPage() {
  const session = await getSession();
  if (!session) redirect("/signin");
  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="mb-6 text-2xl font-semibold">Plan a new road trip</h1>
      <TripForm />
    </main>
  );
}
