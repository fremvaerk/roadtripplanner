import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  postPoi,
  deletePoi,
  patchPoiMove,
  patchPoiOvernight,
  type TripDetail,
} from "@/lib/api/trips";
import type { AddPoiBody } from "@/lib/itinerary/schema";
import { applyMove } from "@/lib/itinerary/move";
import { tripQueryKey } from "@/hooks/use-trip";
import { routeQueryKey } from "@/hooks/use-route";

export function useAddPoi(tripId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: AddPoiBody) => postPoi(tripId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: tripQueryKey(tripId) });
      qc.invalidateQueries({ queryKey: routeQueryKey(tripId) });
    },
  });
}

export function useRemovePoi(tripId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (poiId: string) => deletePoi(poiId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: tripQueryKey(tripId) });
      qc.invalidateQueries({ queryKey: routeQueryKey(tripId) });
    },
  });
}

export function useMovePoi(tripId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { poiId: string; dayId: string | null; orderInDay: number }) =>
      patchPoiMove(v.poiId, v.dayId, v.orderInDay),
    onMutate: async (v) => {
      const key = tripQueryKey(tripId);
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<TripDetail>(key);
      if (prev) qc.setQueryData<TripDetail>(key, applyMove(prev, v.poiId, v.dayId, v.orderInDay));
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(tripQueryKey(tripId), ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: tripQueryKey(tripId) });
      qc.invalidateQueries({ queryKey: routeQueryKey(tripId) });
    },
  });
}

export function useSetOvernight(tripId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { poiId: string; isOvernight: boolean }) =>
      patchPoiOvernight(v.poiId, v.isOvernight),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: tripQueryKey(tripId) });
      qc.invalidateQueries({ queryKey: routeQueryKey(tripId) });
    },
  });
}
