import { useMutation, useQueryClient } from "@tanstack/react-query";
import { postPoi, deletePoi } from "@/lib/api/trips";
import type { AddPoiBody } from "@/lib/itinerary/schema";
import { tripQueryKey } from "@/hooks/use-trip";

export function useAddPoi(tripId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: AddPoiBody) => postPoi(tripId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: tripQueryKey(tripId) }),
  });
}

export function useRemovePoi(tripId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (poiId: string) => deletePoi(poiId),
    onSuccess: () => qc.invalidateQueries({ queryKey: tripQueryKey(tripId) }),
  });
}
