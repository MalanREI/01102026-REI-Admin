"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pill } from "@/src/components/ui";
import { SyncNowButton } from "@/src/components/workspace/SyncNowButton";
import type { ConnectedAccount, AiDetectedProject, SyncStatus } from "@/src/lib/types/workspace";
import { listProjects, getWorkspace } from "@/src/lib/supabase/workspace-queries";

const SUB_NAV_ITEMS = [
  { label: "Dashboard", path: "" },
  { label: "Inbox", path: "/inbox" },
  { label: "Calendar", path: "/calendar" },
  { label: "Files", path: "/files" },
  { label: "Meetings", path: "/meetings" },
  { label: "Schedule", path: "/schedule" },
  { label: "Contacts", path: "/contacts" },
  { label: "Commitments", path: "/commitments" },
  { label: "Topics", path: "/topics" },
  { label: "Lessons", path: "/lessons" },
  { label: "Unsubscribe", path: "/unsubscribe" },
];

export function WorkspaceTopbar({
  workspace,
  activeProjectId,
  onProjectChange,
}: {
  workspace: ConnectedAccount;
  activeProjectId: string | null;
  onProjectChange: (id: string | null) => void;
}) {
  const pathname = usePathname();
  const basePath = `/workspace/${workspace.id}`;
  const [projects, setProjects] = useState<AiDetectedProject[]>([]);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(workspace.sync_status);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(workspace.last_synced_at);
  const [syncError, setSyncError] = useState<string | null>(workspace.sync_error);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    listProjects(workspace.id)
      .then(setProjects)
      .catch((err) => console.error("Failed to load projects:", err));
  }, [workspace.id]);

  // Sync state from props when workspace prop changes (e.g. parent re-fetches)
  useEffect(() => {
    setSyncStatus(workspace.sync_status);
    setLastSyncedAt(workspace.last_synced_at);
    setSyncError(workspace.sync_error);
  }, [workspace.sync_status, workspace.last_synced_at, workspace.sync_error]);

  // Polling while syncing
  useEffect(() => {
    if (syncStatus !== "syncing") {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }

    pollRef.current = setInterval(async () => {
      try {
        const updated = await getWorkspace(workspace.id);
        if (updated) {
          setSyncStatus(updated.sync_status);
          setLastSyncedAt(updated.last_synced_at);
          setSyncError(updated.sync_error);
        }
      } catch (err) {
        console.error("Poll failed:", err);
      }
    }, 3000);

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [syncStatus, workspace.id]);

  const handleSyncStart = useCallback(() => {
    setSyncStatus("syncing");
  }, []);

  const handleSyncComplete = useCallback(async () => {
    try {
      const updated = await getWorkspace(workspace.id);
      if (updated) {
        setSyncStatus(updated.sync_status);
        setLastSyncedAt(updated.last_synced_at);
        setSyncError(updated.sync_error);
      }
    } catch (err) {
      console.error("Post-sync refresh failed:", err);
    }
  }, [workspace.id]);

  const providerLabel = workspace.provider === "gmail" ? "Gmail" : "Outlook";

  return (
    <div className="sticky top-14 z-30 bg-base border-b border-white/[0.06]">
      {/* Row 1: Identity + Project filter + Sync status */}
      <div className="flex items-center justify-between gap-4 px-1 py-3">
        {/* Left: workspace identity */}
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
            style={{ backgroundColor: workspace.color_hex }}
          />
          <span className="font-semibold text-slate-100 truncate">{workspace.display_name}</span>
          <Pill>{providerLabel}</Pill>
        </div>

        {/* Center: project filter */}
        <div className="flex-1 flex justify-center max-w-xs">
          <select
            value={activeProjectId ?? "all"}
            onChange={(e) => onProjectChange(e.target.value === "all" ? null : e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-base px-3 py-1.5 text-xs text-slate-300 outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/50"
          >
            <option value="all">All Projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        {/* Right: sync button */}
        <div className="shrink-0">
          <SyncNowButton
            accountId={workspace.id}
            syncStatus={syncStatus}
            lastSyncedAt={lastSyncedAt}
            syncError={syncError}
            onSyncStart={handleSyncStart}
            onSyncComplete={handleSyncComplete}
          />
        </div>
      </div>

      {/* Row 2: Sub-navigation */}
      <div className="flex overflow-x-auto gap-1 px-1 pb-2" style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
        {SUB_NAV_ITEMS.map((item) => {
          const href = `${basePath}${item.path}`;
          const isActive = item.path === ""
            ? pathname === basePath || pathname === basePath + "/"
            : pathname.startsWith(href);
          return (
            <Link
              key={item.path}
              href={href as Route}
              className={[
                "px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors shrink-0",
                isActive
                  ? "bg-emerald-500/10 text-emerald-400"
                  : "text-slate-400 hover:bg-white/[0.06] hover:text-slate-200",
              ].join(" ")}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
