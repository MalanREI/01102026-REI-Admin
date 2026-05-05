"use client";

import type { Email } from "@/src/lib/types/workspace";
import { formatEmailDate } from "@/src/lib/format";

export function EmailListItem({
  email,
  isSelected,
  onClick,
}: {
  email: Email;
  isSelected: boolean;
  onClick: () => void;
}) {
  const senderDisplay = email.from_name || email.from_address || "Unknown";
  const unread = !email.is_read;

  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "w-full text-left p-3 border-b border-white/[0.04] transition-colors cursor-pointer",
        isSelected
          ? "bg-emerald-500/5 ring-1 ring-emerald-500/30 ring-inset"
          : "hover:bg-white/[0.02]",
      ].join(" ")}
    >
      {/* Top line */}
      <div className="flex items-center gap-2">
        {unread && (
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
        )}
        <span
          className={[
            "flex-1 truncate text-sm",
            unread ? "font-semibold text-slate-100" : "text-slate-300",
          ].join(" ")}
        >
          {senderDisplay}
        </span>
        <span className="flex items-center gap-1.5 shrink-0">
          {email.has_attachments && (
            <span className="text-xs text-slate-500">📎</span>
          )}
          <span className="text-xs text-slate-500">{formatEmailDate(email.sent_at)}</span>
        </span>
      </div>

      {/* Bottom line */}
      <div className="mt-0.5 flex items-baseline gap-0">
        <span
          className={[
            "truncate text-sm",
            unread ? "font-medium text-slate-200" : "text-slate-400",
          ].join(" ")}
        >
          {email.subject || "(no subject)"}
          {email.snippet && (
            <span className="text-slate-500 font-normal"> — {email.snippet}</span>
          )}
        </span>
      </div>
    </button>
  );
}
