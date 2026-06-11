"use client";
import { createContext, useContext } from "react";
type Role = "owner" | "editor" | "viewer";
const Ctx = createContext<{ role?: Role; canEdit: boolean }>({ canEdit: true });
export function PlannerRoleProvider({ role, children }: { role?: Role; children: React.ReactNode }) {
  return <Ctx.Provider value={{ role, canEdit: role !== "viewer" }}>{children}</Ctx.Provider>;
}
export function usePlannerRole() { return useContext(Ctx); }
