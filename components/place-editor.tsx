"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useUpdatePoi } from "@/hooks/use-poi-mutations";
import type { PoiDetail } from "@/lib/api/trips";

export function PlaceEditor({
  poi,
  tripId,
  onClose,
}: {
  poi: PoiDetail;
  tripId: string;
  onClose: () => void;
}) {
  const updatePoi = useUpdatePoi(tripId);
  const [name, setName] = useState(poi.name);
  const [description, setDescription] = useState(poi.description ?? "");
  const [imageUrl, setImageUrl] = useState(poi.imageUrl ?? "");
  const [imgBroken, setImgBroken] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function save() {
    updatePoi.mutate(
      {
        poiId: poi.id,
        name: name.trim() || poi.name,
        description: description.trim() || null,
        imageUrl: imageUrl.trim() || null,
      },
      { onSuccess: () => onClose() },
    );
  }

  const url = imageUrl.trim();

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="pe-title"
        className="w-80 max-w-[90vw] rounded-md border bg-background p-4 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="pe-title" className="mb-2 text-sm font-semibold">Edit place</h3>
        <div className="space-y-2">
          <div>
            <Label htmlFor="pe-name" className="text-xs">Name</Label>
            <Input id="pe-name" value={name} onChange={(e) => setName(e.target.value)} className="h-8 text-sm" />
          </div>
          <div>
            <Label htmlFor="pe-desc" className="text-xs">Description</Label>
            <Textarea id="pe-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="text-sm" />
          </div>
          <div>
            <Label htmlFor="pe-img" className="text-xs">Image URL</Label>
            <Input
              id="pe-img"
              value={imageUrl}
              onChange={(e) => {
                setImageUrl(e.target.value);
                setImgBroken(false);
              }}
              placeholder="https://…"
              className="h-8 text-sm"
            />
            {url && !imgBroken ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={url}
                alt={name}
                onError={() => setImgBroken(true)}
                className="mt-1 h-28 w-full rounded object-cover"
              />
            ) : null}
          </div>
          {poi.address ? (
            <div className="text-xs text-muted-foreground">{poi.address}</div>
          ) : null}
        </div>
        {updatePoi.isError ? (
          <p className="mt-2 text-xs text-red-600">Couldn’t save — check the fields (image must be a valid URL) and try again.</p>
        ) : null}
        <div className="mt-3 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={save} disabled={updatePoi.isPending}>Save</Button>
        </div>
      </div>
    </div>
  );
}
