"use client";

import { useEffect, useRef, useState } from "react";
import { PALETTE } from "@/lib/places/group-colors";

export function GroupColorPicker({
  color,
  label,
  onChange,
}: {
  color: string;
  label: string;
  onChange: (hex: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        aria-label={`Color for ${label}`}
        className="h-4 w-4 rounded-full border"
        style={{ background: color }}
        onClick={() => setOpen((o) => !o)}
      />
      {open && (
        <div className="absolute z-30 mt-1 w-40 rounded-md border bg-background p-2 shadow-md">
          <div className="grid grid-cols-4 gap-1">
            {PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Set color ${c}`}
                className="h-6 w-6 rounded-full border"
                style={{ background: c }}
                onClick={() => {
                  onChange(c);
                  setOpen(false);
                }}
              />
            ))}
          </div>
          <label className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
            Custom
            <input
              type="color"
              value={color}
              onChange={(e) => onChange(e.target.value)}
              className="h-6 w-8 cursor-pointer border-0 bg-transparent p-0"
              aria-label={`Custom color for ${label}`}
            />
          </label>
        </div>
      )}
    </div>
  );
}
