"use client";

import { use } from "react";
import { WorkspaceShell } from "@/src/components/workspace/WorkspaceShell";
import { WorkspaceScaffoldPage } from "@/src/components/workspace/pages/WorkspaceScaffoldPage";

export default function WorkspaceMeetingsPage({ params }: { params: Promise<{ accountId: string }> }) {
  const { accountId } = use(params);
  return (
    <WorkspaceShell accountId={accountId}>
      <WorkspaceScaffoldPage
        title="Meetings"
        description="Meetings detected from this workspace's email — calendar invites, follow-ups, and scheduling threads."
      />
    </WorkspaceShell>
  );
}
