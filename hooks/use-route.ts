import { useQuery } from "@tanstack/react-query";
import { fetchRoute } from "@/lib/api/trips";

export function routeQueryKey(tripId: string) {
  return ["route", tripId] as const;
}

export function useRoute(tripId: string) {
  return useQuery({
    queryKey: routeQueryKey(tripId),
    queryFn: () => fetchRoute(tripId),
  });
}
