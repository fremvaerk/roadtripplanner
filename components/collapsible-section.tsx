"use client";

import { useEffect, useState, type ReactNode } from "react";

/** A sidebar section with a clickable header (chevron + title + optional count)
 *  that collapses its children. Open state persists to localStorage[storageKey];
 *  defaults open (loaded after mount to stay hydration-safe). */
export function CollapsibleSection({
  title,
  count,
  storageKey,
  defaultOpen = true,
  children,
}: {
  title: string;
  count?: number;
  storageKey: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored === "open") setOpen(true);
      else if (stored === "closed") setOpen(false);
    } catch {
      // ignore
    }
  }, [storageKey]);

  function toggle() {
    setOpen((o) => {
      const next = !o;
      try {
        window.localStorage.setItem(storageKey, next ? "open" : "closed");
      } catch {
        // ignore
      }
      return next;
    });
  }

  return (
    <div className="mb-4">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="mb-2 flex w-full items-center gap-1 text-sm font-medium"
      >
        <span className="w-3 text-xs text-muted-foreground">{open ? "▾" : "▸"}</span>
        <span>{title}</span>
        {count != null && <span className="font-normal text-muted-foreground">({count})</span>}
      </button>
      {open && <div>{children}</div>}
    </div>
  );
}
