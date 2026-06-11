import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchShares,
  addShareRequest,
  setShareRoleRequest,
  removeShareRequest,
} from "@/lib/api/trips";

function sharesQueryKey(tripId: string) {
  return ["shares", tripId] as const;
}

export function useShares(tripId: string) {
  return useQuery({
    queryKey: sharesQueryKey(tripId),
    queryFn: () => fetchShares(tripId),
  });
}

export function useAddShare(tripId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { email: string; role: "viewer" | "editor" }) =>
      addShareRequest(tripId, v.email, v.role),
    onSuccess: () => qc.invalidateQueries({ queryKey: sharesQueryKey(tripId) }),
  });
}

export function useSetShareRole(tripId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { shareId: string; role: "viewer" | "editor" }) =>
      setShareRoleRequest(tripId, v.shareId, v.role),
    onSuccess: () => qc.invalidateQueries({ queryKey: sharesQueryKey(tripId) }),
  });
}

export function useRemoveShare(tripId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (shareId: string) => removeShareRequest(tripId, shareId),
    onSuccess: () => qc.invalidateQueries({ queryKey: sharesQueryKey(tripId) }),
  });
}
