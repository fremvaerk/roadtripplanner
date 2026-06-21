import { useMutation, useQueryClient } from "@tanstack/react-query";
import { addViaRequest, moveViaRequest, removeViaRequest } from "@/lib/api/trips";
import { tripQueryKey } from "@/hooks/use-trip";

function useViaMutation<TArgs>(tripId: string, fn: (a: TArgs) => Promise<void>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    // The route follows the trip's signature (see useRoute) — invalidating the
    // trip is enough; the route refetches itself when its inputs change.
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: tripQueryKey(tripId) });
    },
  });
}

export function useAddVia(tripId: string) {
  return useViaMutation(
    tripId,
    (v: { afterPoiId: string | null; dayId: string | null; lat: number; lng: number }) =>
      addViaRequest(tripId, v.afterPoiId, v.dayId, v.lat, v.lng),
  );
}

export function useMoveVia(tripId: string) {
  return useViaMutation(tripId, (v: { viaId: string; lat: number; lng: number }) =>
    moveViaRequest(v.viaId, v.lat, v.lng),
  );
}

export function useRemoveVia(tripId: string) {
  return useViaMutation(tripId, (viaId: string) => removeViaRequest(viaId));
}
