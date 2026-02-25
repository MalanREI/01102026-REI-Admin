"use client";
import { useState } from "react";
import { Button, Textarea } from "@/src/components/ui";
import type { PostStatus, TeamMember } from "@/src/lib/types/social-media";

interface ApprovalActionsProps {
  postId: string;
  postStatus: PostStatus;
  currentMember: TeamMember | null;
  onActionComplete: () => void;
}

/**
 * Renders the appropriate approval action buttons based on post status and user role.
 *
 * - Draft + any role: "Submit for Approval"
 * - Pending + manager/admin: "Approve" / "Reject"
 * - Approved/Rejected: no actions shown
 */
export function ApprovalActions({
  postId,
  postStatus,
  currentMember,
  onActionComplete,
}: ApprovalActionsProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showNotes, setShowNotes] = useState(false);
  const [notes, setNotes] = useState("");
  const [pendingAction, setPendingAction] = useState<"approve" | "reject" | null>(null);

  const canReview =
    currentMember?.role === "manager" || currentMember?.role === "admin";

  const handleSubmit = async () => {
    if (!currentMember) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/approval", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ post_id: postId, submitted_by: currentMember.id }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to submit");
      }
      onActionComplete();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to submit for approval");
    } finally {
      setLoading(false);
    }
  };

  const openReview = (action: "approve" | "reject") => {
    setPendingAction(action);
    setNotes("");
    setShowNotes(true);
  };

  const handleReview = async () => {
    if (!currentMember || !pendingAction) return;
    setLoading(true);
    setError("");
    try {
      // Find the pending approval for this post
      const listRes = await fetch(`/api/approval?post_id=${postId}`);
      if (!listRes.ok) throw new Error("Could not fetch approvals");
      const approvals = await listRes.json();
      const pending = approvals.find(
        (a: { status: string; id: string }) => a.status === "pending"
      );
      if (!pending) throw new Error("No pending approval found");

      const res = await fetch("/api/approval", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: pending.id,
          status: pendingAction,
          reviewed_by: currentMember.id,
          review_notes: notes || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to review");
      }
      setShowNotes(false);
      setPendingAction(null);
      setNotes("");
      onActionComplete();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to review approval");
    } finally {
      setLoading(false);
    }
  };

  if (postStatus === "draft") {
    return (
      <div className="space-y-2">
        <Button variant="ghost" onClick={handleSubmit} disabled={loading || !currentMember}>
          {loading ? "Submitting…" : "Submit for Approval"}
        </Button>
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
    );
  }

  if (postStatus === "pending_approval" && canReview) {
    return (
      <div className="space-y-2">
        {!showNotes ? (
          <div className="flex items-center gap-2">
            <Button onClick={() => openReview("approve")} disabled={loading}>
              Approve
            </Button>
            <Button
              variant="ghost"
              onClick={() => openReview("reject")}
              disabled={loading}
              className="text-red-400 hover:text-red-300 border-red-500/30"
            >
              Reject
            </Button>
          </div>
        ) : (
          <div className="rounded-xl border border-white/[0.06] bg-surface p-4 space-y-3">
            <p className="text-sm font-medium text-slate-300">
              {pendingAction === "approve" ? "Approve with notes (optional)" : "Rejection reason (optional)"}
            </p>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Add review notes…"
            />
            <div className="flex items-center gap-2">
              <Button
                onClick={handleReview}
                disabled={loading}
                className={pendingAction === "reject" ? "bg-red-600 hover:bg-red-500" : ""}
              >
                {loading
                  ? "Saving…"
                  : pendingAction === "approve"
                  ? "Confirm Approval"
                  : "Confirm Rejection"}
              </Button>
              <Button
                variant="ghost"
                onClick={() => { setShowNotes(false); setPendingAction(null); }}
                disabled={loading}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
    );
  }

  return null;
}
