"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider, QueryCache, MutationCache } from "@tanstack/react-query";
import { MapsConfigProvider } from "@/components/maps-config";
import type { MapsConfig } from "@/lib/maps-config";

function handleError(error: unknown) {
  if (error instanceof Error && error.message.includes("(401)")) {
    window.location.href = "/signin";
  }
}

export function Providers({
  children,
  mapsConfig,
}: {
  children: ReactNode;
  mapsConfig: MapsConfig;
}) {
  const [client] = useState(
    () =>
      new QueryClient({
        queryCache: new QueryCache({ onError: handleError }),
        mutationCache: new MutationCache({ onError: handleError }),
        defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <MapsConfigProvider value={mapsConfig}>{children}</MapsConfigProvider>
    </QueryClientProvider>
  );
}
