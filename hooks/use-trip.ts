import { useQuery } from "@tanstack/react-query";
import { fetchTrip } from "@/lib/api/trips";

export function tripQueryKey(tripId: string) {
  return ["trip", tripId] as const;
}

export function useTrip(tripId: string) {
  return useQuery({
    queryKey: tripQueryKey(tripId),
    queryFn: () => fetchTrip(tripId),
  });
}
