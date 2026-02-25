"use client";
import type { PostStatus } from "@/src/lib/types/social-media";

const STEPS: { status: PostStatus; label: string }[] = [
  { status: "draft", label: "Draft" },
  { status: "pending_approval", label: "In Review" },
  { status: "approved", label: "Approved" },
  { status: "scheduled", label: "Scheduled" },
  { status: "published", label: "Published" },
];

const REJECTED_STEP = { status: "rejected" as PostStatus, label: "Rejected" };
const ARCHIVED_STEP = { status: "archived" as PostStatus, label: "Archived" };

function getStepIndex(status: PostStatus): number {
  return STEPS.findIndex((s) => s.status === status);
}

interface ApprovalFlowIndicatorProps {
  status: PostStatus;
}

/**
 * A horizontal stepper showing the approval workflow progress.
 * Handles the rejected and archived edge cases visually.
 */
export function ApprovalFlowIndicator({ status }: ApprovalFlowIndicatorProps) {
  const isRejected = status === "rejected";
  const isArchived = status === "archived";
  const currentIdx = getStepIndex(status);

  const steps = isRejected
    ? [...STEPS.slice(0, 2), REJECTED_STEP]
    : isArchived
    ? [...STEPS, ARCHIVED_STEP]
    : STEPS;

  return (
    <div className="rounded-xl border border-white/[0.06] bg-surface p-4">
      <h3 className="text-xs font-medium text-slate-400 mb-3">Workflow Status</h3>
      <ol className="flex items-center gap-0">
        {steps.map((step, idx) => {
          const isComplete =
            !isRejected && !isArchived
              ? idx < currentIdx
              : isRejected
              ? idx < 2 // draft and in-review are "complete" before rejected
              : idx < steps.length - 1; // all main steps before archived

          const isCurrent = step.status === status;
          const isRejectedStep = step.status === "rejected";

          return (
            <li key={step.status} className="flex items-center">
              <div className="flex flex-col items-center">
                <div
                  className={[
                    "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border transition-colors",
                    isCurrent && isRejectedStep
                      ? "bg-red-600 border-red-600 text-white"
                      : isCurrent
                      ? "bg-emerald-600 border-emerald-600 text-white"
                      : isComplete
                      ? "bg-emerald-900/60 border-emerald-500/50 text-emerald-400"
                      : "bg-base border-white/10 text-slate-500",
                  ].join(" ")}
                >
                  {isComplete ? "✓" : idx + 1}
                </div>
                <span
                  className={[
                    "mt-1 text-[10px] text-center whitespace-nowrap",
                    isCurrent && isRejectedStep
                      ? "text-red-400 font-medium"
                      : isCurrent
                      ? "text-slate-200 font-medium"
                      : isComplete
                      ? "text-slate-400"
                      : "text-slate-600",
                  ].join(" ")}
                >
                  {step.label}
                </span>
              </div>

              {idx < steps.length - 1 && (
                <div
                  className={[
                    "h-px w-8 mx-1 mt-[-10px]",
                    isComplete ? "bg-emerald-600/60" : "bg-white/10",
                  ].join(" ")}
                />
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
