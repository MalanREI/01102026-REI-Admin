"use client";

import { use } from "react";
import { WorkspaceShell } from "@/src/components/workspace/WorkspaceShell";
import { WorkspaceDashboard } from "@/src/components/workspace/pages/WorkspaceDashboard";

export default function WorkspaceDashboardPage({ params }: { params: Promise<{ accountId: string }> }) {
  const { accountId } = use(params);
  return (
    <WorkspaceShell accountId={accountId}>
      <WorkspaceDashboard />
    </WorkspaceShell>
  );
}
