"use client";

import { useEffect, useState } from "react";
import { Card } from "@/src/components/ui";
import { useWorkspace } from "@/src/components/workspace/WorkspaceContext";
import { getWorkspaceStats } from "@/src/lib/supabase/workspace-queries";
import type { WorkspaceStats } from "@/src/lib/types/workspace";

export function WorkspaceDashboard() {
  const { workspace } = useWorkspace();
  const [stats, setStats] = useState<WorkspaceStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getWorkspaceStats(workspace.id)
      .then(setStats)
      .catch((err) => console.error("Failed to load workspace stats:", err))
      .finally(() => setLoading(false));
  }, [workspace.id]);

  return (
    <div className="space-y-5">
      <h1 className="text-lg font-semibold text-slate-100">Dashboard</h1>

      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-white/[0.06] bg-surface p-5 h-24 animate-pulse" />
          ))}
        </div>
      ) : stats ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Total Emails" value={stats.total_emails} />
          <StatCard label="Unread" value={stats.unread_count} highlight />
          <StatCard label="Needs Response" value={stats.needs_response_count} highlight />
          <StatCard label="Action Required" value={stats.action_required_count} highlight />
          <StatCard label="Decision Needed" value={stats.decision_needed_count} />
          <StatCard label="Open Commitments" value={stats.open_commitments_count} />
          <StatCard label="Overdue" value={stats.overdue_commitments_count} warn />
          <StatCard label="Active Projects" value={stats.active_projects_count} />
        </div>
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
