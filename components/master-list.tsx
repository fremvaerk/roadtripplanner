"use client";

import { useState } from "react";
import { DragDropProvider } from "@dnd-kit/react";
import { move } from "@dnd-kit/helpers";
import { GroupSection } from "@/components/group-section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCreateGroup, useRenameGroup, useDeleteGroup, useMoveToGroup, useSetGroupColor } from "@/hooks/use-group-mutations";
import { GroupColorPicker } from "@/components/group-color-picker";
import { usePlannerRole } from "@/components/planner-role";
import { useCollapsed } from "@/hooks/use-collapsed";
import type { TripDetail, PoiDetail } from "@/lib/api/trips";

const UNGROUPED = "__ungrouped__";

export function MasterList({
  trip,
  tripId,
  onFocusPlace,
}: {
  trip: TripDetail;
  tripId: string;
  onFocusPlace?: (lat: number, lng: number) => void;
}) {
  const createGroup = useCreateGroup(tripId);
  const renameGroup = useRenameGroup(tripId);
  const deleteGroup = useDeleteGroup(tripId);
  const setGroupColor = useSetGroupColor(tripId);
  const moveToGroup = useMoveToGroup(tripId);
  const { canEdit } = usePlannerRole();
  const collapse = useCollapsed(`rtp.collapsed.groups.${tripId}`);
  const [newName, setNewName] = useState("");

  const inGroup = (groupId: string | null): PoiDetail[] =>
    trip.pois
      .filter((p) => (p.groupId ?? null) === groupId)
      .sort((a, b) => (a.orderInGroup ?? 0) - (b.orderInGroup ?? 0));

  const groups: Record<string, string[]> = { [UNGROUPED]: inGroup(null).map((p) => p.id) };
  for (const g of trip.poiGroups) groups[g.id] = inGroup(g.id).map((p) => p.id);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function onDragEnd(event: any) {
    if (event.canceled) return;
    const poiId = event.operation?.source?.id;
    if (poiId == null) return;
    const next = move(groups, event) as Record<string, string[]>;
    if (next === groups) return;
    for (const [key, ids] of Object.entries(next)) {
      const i = ids.indexOf(poiId);
      if (i !== -1) {
        moveToGroup.mutate({
          poiId: String(poiId),
          groupId: key === UNGROUPED ? null : key,
          orderInGroup: i,
        });
        return;
      }
    }
  }

  return (
    <div>
      {canEdit ? (
        <form
          className="mb-2 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (newName.trim()) {
              createGroup.mutate(newName.trim());
              setNewName("");
            }
          }}
        >
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New group…"
            className="h-8 text-sm"
          />
          <Button type="submit" size="sm" variant="outline" disabled={!newName.trim()}>
            Add
          </Button>
        </form>
      ) : null}

      <DragDropProvider onDragEnd={onDragEnd}>
        {trip.poiGroups.map((g) => {
          const groupCollapsed = collapse.isCollapsed(g.id);
          return (
          <div key={g.id} className="mb-3">
            <div className="mb-1 flex items-center gap-2">
              <button
                type="button"
                aria-label={groupCollapsed ? `Expand group ${g.name}` : `Collapse group ${g.name}`}
                aria-expanded={!groupCollapsed}
                className="w-3 shrink-0 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => collapse.toggle(g.id)}
              >
                {groupCollapsed ? "▸" : "▾"}
              </button>
              {canEdit ? (
                <GroupColorPicker
                  color={g.color}
                  label={g.name}
                  onChange={(hex) => setGroupColor.mutate({ groupId: g.id, color: hex })}
                />
              ) : null}
              {canEdit ? (
                <input
                  key={g.name}
                  className="flex-1 bg-transparent text-xs font-semibold uppercase tracking-wide text-muted-foreground outline-none"
                  defaultValue={g.name}
                  onBlur={(e) => {
                    const name = e.target.value.trim();
                    if (name && name !== g.name) renameGroup.mutate({ groupId: g.id, name });
                  }}
                  aria-label={`Group name ${g.name}`}
                />
              ) : (
                <span className="flex-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {g.name}
                </span>
              )}
              {canEdit ? (
                <button
                  type="button"
                  aria-label={`Delete group ${g.name}`}
                  className="px-1 text-xs text-muted-foreground hover:text-red-600"
                  onClick={() => deleteGroup.mutate(g.id)}
                >
                  ✕
                </button>
              ) : null}
              {groupCollapsed ? (
                <span className="text-xs font-normal text-muted-foreground">
                  {inGroup(g.id).length}
                </span>
              ) : null}
            </div>
            {!groupCollapsed ? (
              <GroupSection containerId={g.id} pois={inGroup(g.id)} tripId={tripId} days={trip.days} onFocusPlace={onFocusPlace} />
            ) : null}
          </div>
          );
        })}

        {(() => {
          const ungroupedCollapsed = collapse.isCollapsed(UNGROUPED);
          return (
          <div className="mb-3">
            <div className="mb-1 flex items-center gap-2">
              <button
                type="button"
                aria-label={ungroupedCollapsed ? "Expand ungrouped" : "Collapse ungrouped"}
                aria-expanded={!ungroupedCollapsed}
                className="w-3 shrink-0 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => collapse.toggle(UNGROUPED)}
              >
                {ungroupedCollapsed ? "▸" : "▾"}
              </button>
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Ungrouped
              </span>
              {ungroupedCollapsed ? (
                <span className="text-xs font-normal text-muted-foreground">{inGroup(null).length}</span>
              ) : null}
            </div>
            {!ungroupedCollapsed ? (
              <GroupSection containerId={UNGROUPED} pois={inGroup(null)} tripId={tripId} days={trip.days} onFocusPlace={onFocusPlace} />
            ) : null}
          </div>
          );
        })()}
      </DragDropProvider>
    </div>
  );
}
