import { useMutation, useQueryClient } from "@tanstack/react-query";
import { setNightRequest, updateNightRequest, clearNightRequest } from "@/lib/api/trips";
import { tripQueryKey } from "@/hooks/use-trip";
import { routeQueryKey } from "@/hooks/use-route";

function invalidate(qc: ReturnType<typeof useQueryClient>, tripId: string) {
  qc.invalidateQueries({ queryKey: tripQueryKey(tripId) });
  qc.invalidateQueries({ queryKey: routeQueryKey(tripId) });
}

export function useSetNight(tripId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { dayId: string; lat: number; lng: number; title?: string | null; url?: string | null; notes?: string | null }) =>
      setNightRequest(v.dayId, v),
    onSuccess: () => invalidate(qc, tripId),
  });
}

export function useUpdateNight(tripId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { dayId: string; lat?: number; lng?: number; title?: string | null; url?: string | null; notes?: string | null }) => {
      const { dayId, ...patch } = v;
      return updateNightRequest(dayId, patch);
    },
    onSuccess: () => invalidate(qc, tripId),
  });
}

export function useClearNight(tripId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dayId: string) => clearNightRequest(dayId),
    onSuccess: () => invalidate(qc, tripId),
  });
}
