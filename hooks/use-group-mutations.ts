import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  createGroupRequest,
  renameGroupRequest,
  deleteGroupRequest,
  reorderGroupsRequest,
  moveToGroupRequest,
  setGroupColorRequest,
} from "@/lib/api/trips";
import { tripQueryKey } from "@/hooks/use-trip";

export function useCreateGroup(tripId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => createGroupRequest(tripId, name),
    onSuccess: () => qc.invalidateQueries({ queryKey: tripQueryKey(tripId) }),
  });
}

export function useRenameGroup(tripId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { groupId: string; name: string }) => renameGroupRequest(v.groupId, v.name),
    onSuccess: () => qc.invalidateQueries({ queryKey: tripQueryKey(tripId) }),
  });
}

export function useDeleteGroup(tripId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (groupId: string) => deleteGroupRequest(groupId),
    onSuccess: () => qc.invalidateQueries({ queryKey: tripQueryKey(tripId) }),
  });
}

export function useReorderGroups(tripId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (orderedIds: string[]) => reorderGroupsRequest(tripId, orderedIds),
    onSuccess: () => qc.invalidateQueries({ queryKey: tripQueryKey(tripId) }),
  });
}

export function useMoveToGroup(tripId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { poiId: string; groupId: string | null; orderInGroup: number }) =>
      moveToGroupRequest(v.poiId, v.groupId, v.orderInGroup),
    onSuccess: () => qc.invalidateQueries({ queryKey: tripQueryKey(tripId) }),
  });
}

export function useSetGroupColor(tripId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { groupId: string; color: string }) => setGroupColorRequest(v.groupId, v.color),
    onSuccess: () => qc.invalidateQueries({ queryKey: tripQueryKey(tripId) }),
  });
}
