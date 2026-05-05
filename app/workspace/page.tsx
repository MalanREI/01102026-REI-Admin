"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import { PageShell } from "@/src/components/PageShell";
import { listUserWorkspaces } from "@/src/lib/supabase/workspace-queries";
import type { WorkspaceListItem } from "@/src/lib/types/workspace";

export default function WorkspaceIndexPage() {
  const router = useRouter();
  const [workspaces, setWorkspaces] = useState<WorkspaceListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listUserWorkspaces()
      .then((data) => {
        if (data.length === 1) {
          router.replace(`/workspace/${data[0].id}` as Route);
          return;
        }
        setWorkspaces(data);
      })
      .catch((err) => console.error("Failed to load workspaces:", err))
      .finally(() => setLoading(false));
  }, [router]);

  if (loading) {
    return (
      <PageShell>
        <div className="h-1 w-full overflow-hidden rounded-full">
          <div className="h-full w-1/3 bg-emerald-500/30 animate-pulse rounded-full" />
        </div>
      </PageShell>
    );
  }

  if (workspaces.length === 0) {
    return (
      <PageShell>
        <div className="max-w-md mx-auto mt-20 text-center space-y-4">
          <h1 className="text-xl font-semibold text-slate-100">No workspaces connected</h1>
          <p className="text-sm text-slate-400">Connect a Gmail or Outlook account to get started.</p>
          <Link
            href={"/workspace/connect" as Route}
            className="inline-block px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-500 transition-colors"
          >
            + Connect account
          </Link>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <div className="max-w-3xl space-y-5">
        <h1 className="text-xl font-semibold text-slate-100">Your Workspaces</h1>
        <div className="grid gap-3">
          {workspaces.map((ws) => (
            <Link
              key={ws.id}
              href={`/workspace/${ws.id}` as Route}
              className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-surface p-4 hover:bg-white/[0.03] transition-colors"
            >
              <span
                className="inline-block w-3 h-3 rounded-full shrink-0"
                style={{ backgroundColor: ws.color_hex }}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-200 truncate">{ws.display_name}</p>
                <p className="text-xs text-slate-500 truncate">{ws.email_address}</p>
              </div>
              <span className="text-xs text-slate-500 shrink-0 capitalize">{ws.provider}</span>
            </Link>
          ))}
        </div>
        <Link
          href={"/workspace/connect" as Route}
          className="inline-block text-sm text-emerald-400 hover:text-emerald-300 transition-colors"
        >
          + Connect another account
        </Link>
      </div>
    </PageShell>
  );
}
