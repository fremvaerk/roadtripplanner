import { useQuery } from "@tanstack/react-query";
import { fetchTrip } from "@/lib/api/trips";

export function tripQueryKey(tripId: string) {
  return ["trip", tripId] as const;
}

export function useTrip(tripId: string) {
  return useQuery({
    queryKey: tripQueryKey(tripId),
    queryFn: () => fetchTrip(tripId),
    // Pick up edits made by other users on shared trips. The interval pauses
    // automatically while the tab is hidden; returning to the tab refetches.
    // React Query's structural sharing means an unchanged poll yields the same
    // data reference and triggers no re-render (no flicker, camera unaffected).
    refetchInterval: 10_000,
    refetchOnWindowFocus: true,
  });
}
