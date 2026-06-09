import { useMutation, useQueryClient } from "@tanstack/react-query";
import { setTripBaseRequest, setTripTitleRequest, type TripBasePatch } from "@/lib/api/trips";
import { tripQueryKey } from "@/hooks/use-trip";
import { routeQueryKey } from "@/hooks/use-route";

export function useUpdateTripBase(tripId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: TripBasePatch) => setTripBaseRequest(tripId, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: tripQueryKey(tripId) });
      qc.invalidateQueries({ queryKey: routeQueryKey(tripId) });
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
