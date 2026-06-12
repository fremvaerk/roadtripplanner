"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { MapsConfig } from "@/lib/maps-config";

// Seeded once by the root layout from runtime env; consumed by the map components
// via useMapsConfig() instead of reading process.env.NEXT_PUBLIC_* directly.
const MapsConfigContext = createContext<MapsConfig>({
  apiKey: "",
  mapId: "DEMO_MAP_ID",
});

export function MapsConfigProvider({
  value,
  children,
}: {
  value: MapsConfig;
  children: ReactNode;
}) {
  return (
    <MapsConfigContext.Provider value={value}>
      {children}
    </MapsConfigContext.Provider>
  );
}

export function useMapsConfig(): MapsConfig {
  return useContext(MapsConfigContext);
}
