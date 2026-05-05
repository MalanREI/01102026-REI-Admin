"use client";

import { use } from "react";
import { WorkspaceShell } from "@/src/components/workspace/WorkspaceShell";
import { WorkspaceScaffoldPage } from "@/src/components/workspace/pages/WorkspaceScaffoldPage";

export default function WorkspaceUnsubscribePage({ params }: { params: Promise<{ accountId: string }> }) {
  const { accountId } = use(params);
  return (
    <WorkspaceShell accountId={accountId}>
      <WorkspaceScaffoldPage
        title="Unsubscribe"
        description="Manage promotional senders — one-click unsubscribe from newsletters and marketing emails."
      />
    </WorkspaceShell>
  );
}
