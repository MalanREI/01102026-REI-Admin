"use client";

import { useEffect, useState } from "react";
import { Card } from "@/src/components/ui";
import { useWorkspace } from "@/src/components/workspace/WorkspaceContext";
import { ReconnectBanner } from "@/src/components/workspace/ReconnectBanner";
import { getWorkspaceStats, listConversations } from "@/src/lib/supabase/workspace-queries";
import type { WorkspaceStats } from "@/src/lib/types/workspace";

interface DashboardCounts extends WorkspaceStats {
  inbox_conversations: number;
  followup_conversations: number;
  snoozed_conversations: number;
  total_conversations: number;
}

export function WorkspaceDashboard() {
  const { workspace } = useWorkspace();
  const [counts, setCounts] = useState<DashboardCounts | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [stats, inboxConvs, followupConvs, snoozedConvs, allConvs] = await Promise.all([
          getWorkspaceStats(workspace.id),
          listConversations(workspace.id, { userState: "inbox", limit: 1 }),
          listConversations(workspace.id, { userState: "followup", limit: 1 }),
          listConversations(workspace.id, { userState: "snoozed", limit: 1 }),
          listConversations(workspace.id, { userState: "all", limit: 1 }),
        ]);
        // The list queries return up to 1 item, but we need counts.
        // Since we don't have an aggregate endpoint, use a workaround:
        // fetch with high limit and count. For now, use the first 50 and count.
        const [inbox50, followup50, snoozed50, all50] = await Promise.all([
          listConversations(workspace.id, { userState: "inbox", limit: 999 }),
          listConversations(workspace.id, { userState: "followup", limit: 999 }),
          listConversations(workspace.id, { userState: "snoozed", limit: 999 }),
          listConversations(workspace.id, { userState: "all", limit: 999 }),
        ]);
        setCounts({
          ...stats,
          inbox_conversations: inbox50.length,
          followup_conversations: followup50.length,
          snoozed_conversations: snoozed50.length,
          total_conversations: all50.length,
        });
      } catch (err) {
        console.error("Failed to load dashboard:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [workspace.id]);

  return (
    <div className="space-y-5">
      <ReconnectBanner workspace={workspace} />
      <h1 className="text-lg font-semibold text-slate-100">Dashboard</h1>

      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-white/[0.06] bg-surface p-5 h-24 animate-pulse" />
          ))}
        </div>
      ) : counts ? (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Inbox" value={counts.inbox_conversations} highlight />
            <StatCard label="Needs Follow-up" value={counts.followup_conversations} warn={counts.followup_conversations > 0} />
            <StatCard label="Snoozed" value={counts.snoozed_conversations} />
            <StatCard label="Conversations" value={counts.total_conversations} />
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Total Emails" value={counts.total_emails} />
            <StatCard label="Unread" value={counts.unread_count} highlight />
            <StatCard label="Needs Response" value={counts.needs_response_count} highlight />
            <StatCard label="Action Required" value={counts.action_required_count} highlight />
            <StatCard label="Active Projects" value={counts.active_projects_count} />
            <StatCard label="Open Commitments" value={counts.open_commitments_count} />
            <StatCard label="Overdue" value={counts.overdue_commitments_count} warn />
            <StatCard label="Active Topics" value={counts.active_topics_count} />
          </div>
        </>
      ) : (
        <Card title="No data">
          <p className="text-sm text-slate-400">Connect and sync this workspace to see stats.</p>
        </Card>
      )}
    </div>
  );
}

function StatCard({ label, value, highlight, warn }: { label: string; value: number; highlight?: boolean; warn?: boolean }) {
  const valueColor = warn && value > 0
    ? "text-red-400"
    : highlight && value > 0
      ? "text-emerald-400"
      : "text-slate-100";
  return (
    <div className="rounded-xl border border-white/[0.06] bg-surface p-4">
      <p className={`text-2xl font-semibold ${valueColor}`}>{value}</p>
      <p className="text-xs text-slate-500 mt-1">{label}</p>
    </div>
  );
}
