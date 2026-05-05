"use client";

import { use } from "react";
import { WorkspaceShell } from "@/src/components/workspace/WorkspaceShell";
import { WorkspaceScaffoldPage } from "@/src/components/workspace/pages/WorkspaceScaffoldPage";

export default function WorkspaceCommitmentsPage({ params }: { params: Promise<{ accountId: string }> }) {
  const { accountId } = use(params);
  return (
    <WorkspaceShell accountId={accountId}>
      <WorkspaceScaffoldPage
        title="Commitments"
        description="Promises made by you and to you — AI-detected from emails and meetings, tracked with due dates."
      />
    </WorkspaceShell>
  );
}
