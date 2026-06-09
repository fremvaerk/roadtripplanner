"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { PlacePick } from "@/components/place-autocomplete";

type MapPickContextValue = {
  armedId: string | null;
  arm: (id: string, onPick: (p: PlacePick) => void) => void;
  disarm: (id?: string) => void;
  consume: (p: PlacePick) => boolean;
};

const MapPickContext = createContext<MapPickContextValue | null>(null);

export function MapPickProvider({ children }: { children: React.ReactNode }) {
  const onPickRef = useRef<((p: PlacePick) => void) | null>(null);
  const [armedId, setArmedId] = useState<string | null>(null);

  const arm = useCallback((id: string, onPick: (p: PlacePick) => void) => {
    onPickRef.current = onPick;
    setArmedId(id);
  }, []);

  const disarm = useCallback((id?: string) => {
    setArmedId((cur) => {
      if (id !== undefined && id !== cur) return cur; // stale id: leave the current target armed
      onPickRef.current = null;
      return null;
    });
  }, []);

  const consume = useCallback((p: PlacePick) => {
    const fn = onPickRef.current;
    if (!fn) return false;
    fn(p);
    onPickRef.current = null;
    setArmedId(null);
    return true;
  }, []);

  useEffect(() => {
    if (!armedId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onPickRef.current = null;
        setArmedId(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [armedId]);

  return (
    <MapPickContext.Provider value={{ armedId, arm, disarm, consume }}>
      {children}
    </MapPickContext.Provider>
  );
}

export function useMapPick(): MapPickContextValue | null {
  return useContext(MapPickContext);
}
