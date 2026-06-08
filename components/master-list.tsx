"use client";

import { useState } from "react";
import { DragDropProvider } from "@dnd-kit/react";
import { move } from "@dnd-kit/helpers";
import { GroupSection } from "@/components/group-section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCreateGroup, useRenameGroup, useDeleteGroup, useMoveToGroup } from "@/hooks/use-group-mutations";
import type { TripDetail, PoiDetail } from "@/lib/api/trips";

const UNGROUPED = "__ungrouped__";

export function MasterList({ trip, tripId }: { trip: TripDetail; tripId: string }) {
  const createGroup = useCreateGroup(tripId);
  const renameGroup = useRenameGroup(tripId);
  const deleteGroup = useDeleteGroup(tripId);
  const moveToGroup = useMoveToGroup(tripId);
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

      <DragDropProvider onDragEnd={onDragEnd}>
        {trip.poiGroups.map((g) => (
          <div key={g.id} className="mb-3">
            <div className="mb-1 flex items-center justify-between">
              <input
                key={g.name}
                className="w-full bg-transparent text-xs font-semibold uppercase tracking-wide text-muted-foreground outline-none"
                defaultValue={g.name}
                onBlur={(e) => {
                  const name = e.target.value.trim();
                  if (name && name !== g.name) renameGroup.mutate({ groupId: g.id, name });
                }}
                aria-label={`Group name ${g.name}`}
              />
              <button
                type="button"
                aria-label={`Delete group ${g.name}`}
                className="px-1 text-xs text-muted-foreground hover:text-red-600"
                onClick={() => deleteGroup.mutate(g.id)}
              >
                ✕
              </button>
            </div>
            <GroupSection containerId={g.id} pois={inGroup(g.id)} tripId={tripId} days={trip.days} />
          </div>
        ))}

        <div className="mb-3">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Ungrouped
          </div>
          <GroupSection containerId={UNGROUPED} pois={inGroup(null)} tripId={tripId} days={trip.days} />
        </div>
      </DragDropProvider>
    </div>
  );
}
