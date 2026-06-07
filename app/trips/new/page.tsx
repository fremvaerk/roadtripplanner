import { TripForm } from "@/components/trip-form";

export default function NewTripPage() {
  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="mb-6 text-2xl font-semibold">Plan a new road trip</h1>
      <TripForm />
    </main>
  );
}
