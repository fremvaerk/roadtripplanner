"use client";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { PlannerShell } from "@/components/planner-shell";
import { NavCompanion } from "@/components/mobile/nav-companion";

export function TripView({ tripId, role }: { tripId: string; role?: "owner" | "editor" | "viewer" }) {
  const isMobile = useIsMobile();
  if (isMobile === null) {
    return <div className="flex min-h-screen items-center justify-center p-8 text-sm text-muted-foreground">Loading…</div>;
  }
  return isMobile ? <NavCompanion tripId={tripId} role={role} /> : <PlannerShell tripId={tripId} role={role} />;
}
