import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchRoute } from "@/lib/api/trips";
import { useTrip } from "@/hooks/use-trip";
import { routeSignature } from "@/lib/routing/route-signature";

export function routeQueryKey(tripId: string) {
  return ["route", tripId] as const;
}

export function useRoute(tripId: string) {
  const qc = useQueryClient();
  const { data: trip } = useTrip(tripId);
  const prevSig = useRef<string | null>(null);

  // The route is a pure function of the trip's waypoints, so refetch the (paid)
  // Routes API exactly when those inputs change — and only then. This single
  // rule covers local edits (the trip cache updates optimistically / on refetch)
  // AND other users' edits (surfaced by useTrip's polling), one fetch each.
  // Because of this, the mutation hooks no longer invalidate the route directly.
  useEffect(() => {
    if (!trip) return;
    const sig = routeSignature(trip);
    if (prevSig.current !== null && prevSig.current !== sig) {
      qc.invalidateQueries({ queryKey: routeQueryKey(tripId) });
    }
    prevSig.current = sig;
  }, [trip, tripId, qc]);

  return useQuery({
    queryKey: routeQueryKey(tripId),
    queryFn: () => fetchRoute(tripId),
  });
}
