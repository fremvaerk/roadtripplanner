import { useMutation, useQueryClient } from "@tanstack/react-query";
import { setTripBaseRequest, type TripBasePatch } from "@/lib/api/trips";
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
