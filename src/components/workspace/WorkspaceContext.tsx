"use client";

import { createContext, useContext } from "react";
import type { ConnectedAccount } from "@/src/lib/types/workspace";

export interface WorkspaceContextValue {
  workspace: ConnectedAccount;
  activeProjectId: string | null;
  setActiveProjectId: (id: string | null) => void;
}

export const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used within a WorkspaceShell");
  return ctx;
}
