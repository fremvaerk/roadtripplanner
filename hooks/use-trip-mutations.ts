import { useMutation, useQueryClient } from "@tanstack/react-query";
import { setTripBaseRequest, setTripTitleRequest, archiveTripRequest, type TripBasePatch } from "@/lib/api/trips";
import { tripQueryKey } from "@/hooks/use-trip";

export function useUpdateTripBase(tripId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: TripBasePatch) => setTripBaseRequest(tripId, patch),
    // Start/finish changes affect the route, but the route follows the trip's
    // signature (see useRoute) — invalidating the trip is enough.
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: tripQueryKey(tripId) });
    },
  });
}

export function useSetTripTitle(tripId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (title: string) => setTripTitleRequest(tripId, title),
    onSuccess: () => qc.invalidateQueries({ queryKey: tripQueryKey(tripId) }),
  });
}

export function useArchiveTrip(tripId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (archived: boolean) => archiveTripRequest(tripId, archived),
    onSuccess: () => qc.invalidateQueries({ queryKey: tripQueryKey(tripId) }),
  });
}
