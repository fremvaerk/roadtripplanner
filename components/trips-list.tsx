"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { archiveTripRequest, deleteTripRequest, exportTripUrl } from "@/lib/api/trips";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { CarIcon, PinIcon } from "@/components/ui/icons";
import { formatDuration, formatKm } from "@/lib/format";

export type TripListItem = {
  id: string;
  title: string;
  startName: string;
  endName: string | null;
  isRoundTrip: boolean;
  archivedAt: string | null;
  role?: "owner" | "editor" | "viewer";
  coverImage?: string | null;
  dayCount?: number;
  poiCount?: number;
  driveSeconds?: number | null;
  driveMeters?: number | null;
};

function subtitle(t: TripListItem): string {
  if (t.isRoundTrip) return `${t.startName} ↺ round trip`;
  return `${t.startName}${t.endName ? ` → ${t.endName}` : " → (open)"}`;
}

export function TripsList({ trips }: { trips: TripListItem[] }) {
  const router = useRouter();
  const [showArchived, setShowArchived] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [removing, setRemoving] = useState<TripListItem | null>(null);

  const active = trips.filter((t) => !t.archivedAt);
  const archived = trips
    .filter((t) => t.archivedAt)
    .sort((a, b) => (a.archivedAt! < b.archivedAt! ? 1 : -1));

  async function setArchived(id: string, value: boolean) {
    setBusyId(id);
    try {
      await archiveTripRequest(id, value);
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusyId(null);
    }
  }

  async function confirmRemove() {
    if (!removing) return;
    const id = removing.id;
    setBusyId(id);
    try {
      await deleteTripRequest(id);
      setRemoving(null);
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Remove failed");
    } finally {
      setBusyId(null);
    }
  }

  if (active.length === 0 && archived.length === 0) {
    return <p className="text-muted-foreground">No trips yet. Create your first one.</p>;
  }

  return (
    <>
      <ul className="space-y-2">
        {active.map((t) => (
          <TripRow
            key={t.id}
            trip={t}
            busy={busyId === t.id}
            onArchive={() => setArchived(t.id, true)}
            onRemove={() => setRemoving(t)}
          />
        ))}
      </ul>

      {archived.length > 0 && (
        <div className="mt-6">
          <button
            type="button"
            className="text-sm text-muted-foreground hover:text-foreground"
            onClick={() => setShowArchived((v) => !v)}
            aria-expanded={showArchived}
          >
            {showArchived ? "▾ Hide archived" : `▸ Show archived (${archived.length})`}
          </button>
          {showArchived && (
            <ul className="mt-2 space-y-2">
              {archived.map((t) => (
                <TripRow
                  key={t.id}
                  trip={t}
                  archived
                  busy={busyId === t.id}
                  onRestore={() => setArchived(t.id, false)}
                  onRemove={() => setRemoving(t)}
                />
              ))}
            </ul>
          )}
        </div>
      )}

      {removing && (
        <ConfirmDialog
          title="Remove trip?"
          message={
            <>
              <strong>{removing.title}</strong> and everything in it (days, places,
              route) will be permanently deleted. This cannot be undone.
            </>
          }
          confirmLabel="Remove"
          pending={busyId === removing.id}
          onConfirm={confirmRemove}
          onClose={() => setRemoving(null)}
        />
      )}
    </>
  );
}

function downloadExport(id: string) {
  const a = document.createElement("a");
  a.href = exportTripUrl(id);
  a.download = ""; // let the server's Content-Disposition filename win
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function TripRow({
  trip,
  archived = false,
  busy,
  onArchive,
  onRestore,
  onRemove,
}: {
  trip: TripListItem;
  archived?: boolean;
  busy: boolean;
  onArchive?: () => void;
  onRestore?: () => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <li className={`relative ${archived ? "opacity-60" : ""}`}>
      <Link
        href={`/trips/${trip.id}`}
        className="flex gap-4 overflow-hidden rounded-xl border bg-card pr-12 shadow-xs transition-all hover:border-foreground/20 hover:shadow-md"
      >
        <TripCover trip={trip} />
        <div className="min-w-0 flex-1 py-3 pr-1">
          <div className="truncate font-medium tracking-tight">{trip.title}</div>
          <div className="mt-0.5 truncate text-sm text-muted-foreground">{subtitle(trip)}</div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {trip.dayCount ? <span>{trip.dayCount} {trip.dayCount === 1 ? "day" : "days"}</span> : null}
            {trip.poiCount ? <span>{trip.poiCount} {trip.poiCount === 1 ? "place" : "places"}</span> : null}
            {trip.driveSeconds ? (
              <span className="inline-flex items-center gap-1">
                <CarIcon /> {formatDuration(trip.driveSeconds)}
                {trip.driveMeters ? ` · ${formatKm(trip.driveMeters)}` : ""}
              </span>
            ) : null}
          </div>
        </div>
      </Link>
      <div className="absolute right-2 top-2">
        <button
          type="button"
          aria-label="Trip actions"
          aria-haspopup="menu"
          aria-expanded={open}
          disabled={busy}
          className="rounded px-2 py-1 text-muted-foreground hover:bg-muted disabled:opacity-50"
          onClick={() => setOpen((v) => !v)}
        >
          ⋮
        </button>
        {open && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <div role="menu" className="absolute right-0 z-20 mt-1 w-32 rounded-md border bg-background py-1 shadow-md">
              <MenuItem
                label="Export"
                onClick={() => {
                  setOpen(false);
                  downloadExport(trip.id);
                }}
              />
              {archived ? (
                <MenuItem
                  label="Restore"
                  onClick={() => {
                    setOpen(false);
                    onRestore?.();
                  }}
                />
              ) : (
                <MenuItem
                  label="Archive"
                  onClick={() => {
                    setOpen(false);
                    onArchive?.();
                  }}
                />
              )}
              <MenuItem
                label="Remove"
                destructive
                onClick={() => {
                  setOpen(false);
                  onRemove();
                }}
              />
            </div>
          </>
        )}
      </div>
    </li>
  );
}

/** Trip cover: a representative place photo, or a map-tinted placeholder. */
function TripCover({ trip }: { trip: TripListItem }) {
  const [broken, setBroken] = useState(false);
  const showImg = trip.coverImage && !broken;
  return (
    <div className="relative w-24 shrink-0 self-stretch overflow-hidden bg-gradient-to-br from-muted to-[oklch(0.6_0.094_215/0.14)] sm:w-32">
      {showImg ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={trip.coverImage!}
          alt=""
          referrerPolicy="no-referrer"
          onError={() => setBroken(true)}
          className="absolute inset-0 size-full object-cover"
        />
      ) : (
        <div className="flex size-full items-center justify-center text-[oklch(0.6_0.094_215)]/40">
          <PinIcon className="size-8" />
        </div>
      )}
    </div>
  );
}

function MenuItem({
  label,
  destructive = false,
  onClick,
}: {
  label: string;
  destructive?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      className={`block w-full px-3 py-1.5 text-left text-sm hover:bg-accent ${
        destructive ? "text-red-600" : ""
      }`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
