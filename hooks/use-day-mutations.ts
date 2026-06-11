import { useMutation, useQueryClient } from "@tanstack/react-query";
import { addDayRequest, insertDayAfterRequest, removeDayRequest, setStartDateRequest, setDayColorRequest } from "@/lib/api/trips";
import { tripQueryKey } from "@/hooks/use-trip";
import { routeQueryKey } from "@/hooks/use-route";

function invalidate(qc: ReturnType<typeof useQueryClient>, tripId: string) {
  qc.invalidateQueries({ queryKey: tripQueryKey(tripId) });
  qc.invalidateQueries({ queryKey: routeQueryKey(tripId) });
}

export function useAddDay(tripId: string) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: () => addDayRequest(tripId), onSuccess: () => invalidate(qc, tripId) });
}

export function useInsertDayAfter(tripId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (afterDayId: string) => insertDayAfterRequest(tripId, afterDayId),
    onSuccess: () => invalidate(qc, tripId),
  });
}

export function useRemoveDay(tripId: string) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (dayId: string) => removeDayRequest(dayId), onSuccess: () => invalidate(qc, tripId) });
}

export function useSetStartDate(tripId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (startDate: string | null) => setStartDateRequest(tripId, startDate),
    onSuccess: () => invalidate(qc, tripId),
  });
}

export function useSetDayColor(tripId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { dayId: string; color: string }) => setDayColorRequest(v.dayId, v.color),
    onSuccess: () => invalidate(qc, tripId),
  });
}
