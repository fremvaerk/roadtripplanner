import { useMutation, useQueryClient } from "@tanstack/react-query";
import { setNightRequest, updateNightRequest, clearNightRequest } from "@/lib/api/trips";
import type { TripDetail } from "@/lib/api/trips";
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
    // Optimistically move the night so dragging a multi-night marker shifts every
    // night at once — without this, the N sequential mutations settle one by one
    // and the grouped marker briefly splits.
    onMutate: async (v) => {
      if (v.lat == null || v.lng == null) return;
      const key = tripQueryKey(tripId);
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<TripDetail>(key);
      qc.setQueryData<TripDetail>(key, (old) =>
        old
          ? {
              ...old,
              days: old.days.map((d) =>
                d.id === v.dayId && d.night
                  ? { ...d, night: { ...d.night, lat: v.lat!, lng: v.lng! } }
                  : d,
              ),
            }
          : old,
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(tripQueryKey(tripId), ctx.prev);
    },
    onSettled: () => invalidate(qc, tripId),
  });
}

export function useClearNight(tripId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dayId: string) => clearNightRequest(dayId),
    onSuccess: () => invalidate(qc, tripId),
  });
}
