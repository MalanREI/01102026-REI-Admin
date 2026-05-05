"use client";

import { use } from "react";
import { WorkspaceShell } from "@/src/components/workspace/WorkspaceShell";
import { WorkspaceScaffoldPage } from "@/src/components/workspace/pages/WorkspaceScaffoldPage";

export default function WorkspaceInboxPage({ params }: { params: Promise<{ accountId: string }> }) {
  const { accountId } = use(params);
  return (
    <WorkspaceShell accountId={accountId}>
      <WorkspaceScaffoldPage
        title="Inbox"
        description="AI-triaged email inbox with categories: needs response, action required, decision needed, FYI, and CC only."
      />
    </WorkspaceShell>
  );
}
