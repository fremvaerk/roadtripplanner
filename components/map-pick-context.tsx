"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
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
    setArmedId((cur) => (id !== undefined && id !== cur ? cur : null));
  }, []);

  const consume = useCallback((p: PlacePick) => {
    const fn = onPickRef.current;
    if (!fn) return false;
    onPickRef.current = null;
    fn(p);
    setArmedId(null);
    return true;
  }, []);

  // Clearing the callback ref is a side-effect, so do it reactively when disarmed —
  // keeps the setState updaters pure / React-Strict-Mode safe.
  useEffect(() => {
    if (armedId === null) onPickRef.current = null;
  }, [armedId]);

  useEffect(() => {
    if (!armedId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setArmedId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [armedId]);

  const value = useMemo(() => ({ armedId, arm, disarm, consume }), [armedId, arm, disarm, consume]);

  return <MapPickContext.Provider value={value}>{children}</MapPickContext.Provider>;
}

export function useMapPick(): MapPickContextValue | null {
  return useContext(MapPickContext);
}
