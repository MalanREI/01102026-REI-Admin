"use client";

import { ReactNode, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import { PageShell } from "@/src/components/PageShell";
import { WorkspaceTopbar } from "@/src/components/workspace/WorkspaceTopbar";
import { WorkspaceContext } from "@/src/components/workspace/WorkspaceContext";
import { getWorkspace } from "@/src/lib/supabase/workspace-queries";
import type { ConnectedAccount } from "@/src/lib/types/workspace";

export function WorkspaceShell({ accountId, children }: { accountId: string; children: ReactNode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [workspace, setWorkspace] = useState<ConnectedAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const activeProjectId = searchParams.get("project") === "all" ? null : searchParams.get("project");

  const setActiveProjectId = useCallback((id: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (id) {
      params.set("project", id);
    } else {
      params.delete("project");
    }
    const qs = params.toString();
    router.replace(`?${qs}`, { scroll: false });
  }, [router, searchParams]);

  useEffect(() => {
    setLoading(true);
    getWorkspace(accountId)
      .then((data) => {
        if (!data) {
          setNotFound(true);
        } else {
          setWorkspace(data);
        }
      })
      .catch((err) => {
        console.error("Failed to load workspace:", err);
        setNotFound(true);
      })
      .finally(() => setLoading(false));
  }, [accountId]);

  if (loading) {
    return (
      <PageShell>
        <div className="h-1 w-full overflow-hidden rounded-full">
          <div className="h-full w-1/3 bg-emerald-500/30 animate-pulse rounded-full" />
        </div>
      </PageShell>
    );
  }

  if (notFound || !workspace) {
    return (
      <PageShell>
        <div className="max-w-md mx-auto mt-20 text-center space-y-4">
          <p className="text-slate-400">Workspace not found or no longer accessible.</p>
          <Link
            href={"/workspace" as Route}
            className="inline-block text-sm text-emerald-400 hover:text-emerald-300 transition-colors"
          >
            &larr; Back to workspaces
          </Link>
        </div>
      </PageShell>
    );
  }

  return (
    <WorkspaceContext.Provider value={{ workspace, activeProjectId, setActiveProjectId }}>
      <PageShell>
        <WorkspaceTopbar
          workspace={workspace}
          activeProjectId={activeProjectId}
          onProjectChange={setActiveProjectId}
        />
        <div className="max-w-7xl mt-4">
          {children}
        </div>
      </PageShell>
    </WorkspaceContext.Provider>
  );
}
