"use client";
import { useCallback, useEffect, useState } from "react";
import type { ContentApproval } from "@/src/lib/types/social-media";

interface ApprovalTimelineProps {
  postId: string;
  /** Pass this to trigger a re-fetch after an action */
  refreshKey?: number;
}

interface ApprovalWithMembers extends ContentApproval {
  submitted_by_member?: { id: string; display_name: string; avatar_url: string | null } | null;
  reviewed_by_member?: { id: string; display_name: string; avatar_url: string | null } | null;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

const STATUS_STYLES: Record<string, { dot: string; label: string; text: string }> = {
  pending: {
    dot: "bg-yellow-500",
    label: "Submitted for Review",
    text: "text-yellow-300",
  },
  approved: {
    dot: "bg-emerald-500",
    label: "Approved",
    text: "text-emerald-400",
  },
  rejected: {
    dot: "bg-red-500",
    label: "Rejected",
    text: "text-red-400",
  },
};

/**
 * Displays the full approval history for a post as a vertical timeline.
 */
export function ApprovalTimeline({ postId, refreshKey = 0 }: ApprovalTimelineProps) {
  const [approvals, setApprovals] = useState<ApprovalWithMembers[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchApprovals = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/approval?post_id=${postId}`);
      if (res.ok) {
        const data = await res.json();
        setApprovals(data);
      }
    } finally {
      setLoading(false);
    }
  }, [postId]);

  useEffect(() => {
    fetchApprovals();
  }, [fetchApprovals, refreshKey]);

  if (loading) {
    return (
      <div className="rounded-xl border border-white/[0.06] bg-surface p-4">
        <h3 className="text-xs font-medium text-slate-400 mb-3">Approval History</h3>
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-10 rounded-lg bg-white/[0.04] animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (approvals.length === 0) {
    return (
      <div className="rounded-xl border border-white/[0.06] bg-surface p-4">
        <h3 className="text-xs font-medium text-slate-400 mb-2">Approval History</h3>
        <p className="text-xs text-slate-600">No approval activity yet.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/[0.06] bg-surface p-4">
      <h3 className="text-xs font-medium text-slate-400 mb-3">Approval History</h3>
      <ol className="relative space-y-4 border-l border-white/[0.06] ml-2">
        {approvals.map((approval) => {
          const cfg = STATUS_STYLES[approval.status] ?? STATUS_STYLES.pending;
          return (
            <li key={approval.id} className="ml-4">
              <span
                className={`absolute -left-1.5 mt-1.5 w-3 h-3 rounded-full border-2 border-surface ${cfg.dot}`}
              />
              <div className="space-y-0.5">
                <p className={`text-xs font-medium ${cfg.text}`}>{cfg.label}</p>
                <p className="text-xs text-slate-500">
                  {formatDate(approval.submitted_at)}
                  {approval.submitted_by_member && (
                    <> · <span className="text-slate-400">{approval.submitted_by_member.display_name}</span></>
                  )}
                </p>
                {approval.reviewed_at && (
                  <p className="text-xs text-slate-500">
                    Reviewed {formatDate(approval.reviewed_at)}
                    {approval.reviewed_by_member && (
                      <> · <span className="text-slate-400">{approval.reviewed_by_member.display_name}</span></>
                    )}
                  </p>
                )}
                {approval.review_notes && (
                  <p className="text-xs text-slate-400 mt-1 italic">&ldquo;{approval.review_notes}&rdquo;</p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
