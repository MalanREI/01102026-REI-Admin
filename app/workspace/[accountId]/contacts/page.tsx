"use client";

import { use } from "react";
import { WorkspaceShell } from "@/src/components/workspace/WorkspaceShell";
import { WorkspaceScaffoldPage } from "@/src/components/workspace/pages/WorkspaceScaffoldPage";

export default function WorkspaceContactsPage({ params }: { params: Promise<{ accountId: string }> }) {
  const { accountId } = use(params);
  return (
    <WorkspaceShell accountId={accountId}>
      <WorkspaceScaffoldPage
        title="Contacts"
        description="People you communicate with in this workspace — frequency, recency, and project associations."
      />
    </WorkspaceShell>
  );
}
