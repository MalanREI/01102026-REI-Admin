"use client";
import type { PostStatus, ScheduleType } from "@/src/lib/types/social-media";

const STATUS_CONFIG: Record<PostStatus, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-slate-700 text-slate-300" },
  pending_approval: { label: "Pending", className: "bg-yellow-900/60 text-yellow-300" },
  approved: { label: "Approved", className: "bg-emerald-900/60 text-emerald-300" },
  scheduled: { label: "Scheduled", className: "bg-blue-900/60 text-blue-300" },
  published: { label: "Published", className: "bg-green-900/60 text-green-300" },
  rejected: { label: "Rejected", className: "bg-red-900/60 text-red-300" },
  archived: { label: "Archived", className: "bg-gray-700 text-gray-400" },
};

interface PostScheduleBadgeProps {
  status: PostStatus;
  scheduleType?: ScheduleType;
  /** If true, shows a small recurring ↺ symbol when schedule_type is 'recurring'. */
  showRecurring?: boolean;
}

/**
 * Compact badge showing a post's publish status and optional recurring indicator.
 */
export function PostScheduleBadge({
  status,
  scheduleType,
  showRecurring = true,
}: PostScheduleBadgeProps) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, className: "bg-slate-700 text-slate-300" };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${cfg.className}`}
    >
      {showRecurring && scheduleType === "recurring" && (
        <span title="Recurring" aria-label="Recurring">↺</span>
      )}
      {cfg.label}
    </span>
  );
}
