"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Pill } from "@/src/components/ui";
import type { ConnectedAccount, AiDetectedProject } from "@/src/lib/types/workspace";
import { listProjects } from "@/src/lib/supabase/workspace-queries";

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

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return "Not synced yet";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays === 1) return "Yesterday";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

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

  useEffect(() => {
    listProjects(workspace.id)
      .then(setProjects)
      .catch((err) => console.error("Failed to load projects:", err));
  }, [workspace.id]);

  const providerLabel = workspace.provider === "gmail" ? "Gmail" : "Outlook";
  const syncLabel = workspace.sync_status === "syncing"
    ? "Syncing…"
    : formatRelativeTime(workspace.last_synced_at);

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

        {/* Right: sync status */}
        <div className="flex items-center gap-1.5 text-xs text-slate-500 shrink-0">
          {workspace.sync_status === "syncing" ? (
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          ) : (
            <span className="inline-block w-2 h-2 rounded-full bg-slate-600" />
          )}
          <span>{syncLabel}</span>
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
