"use client";

import { formatEmailDate } from "@/src/lib/format";
import { useWorkspace } from "@/src/components/workspace/WorkspaceContext";
import type { Conversation } from "@/src/lib/types/workspace";

export function ConversationListItem({
  conversation,
  isSelected,
  onClick,
}: {
  conversation: Conversation;
  isSelected: boolean;
  onClick: () => void;
}) {
  const { workspace } = useWorkspace();
  const myEmail = workspace.email_address.toLowerCase();
  const hasUnread = conversation.unread_count > 0;

  // Most recent participant excluding self
  const otherParticipants = conversation.participants.filter(
    (p) => p.address.toLowerCase() !== myEmail
  );
  const displayName = otherParticipants[0]?.name || otherParticipants[0]?.address || "Me";

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
        {hasUnread && (
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
        )}
        <span className={["flex-1 truncate text-sm", hasUnread ? "font-semibold text-slate-100" : "text-slate-300"].join(" ")}>
          {displayName}
          {otherParticipants.length > 1 && (
            <span className="text-slate-500 font-normal"> +{otherParticipants.length - 1}</span>
          )}
        </span>
        <span className="flex items-center gap-1.5 shrink-0">
          {conversation.has_attachments && <span className="text-xs text-slate-500">📎</span>}
          <span className="text-xs text-slate-500">{formatEmailDate(conversation.last_message_at)}</span>
        </span>
      </div>

      {/* Bottom line */}
      <div className="mt-0.5 flex items-center gap-1.5">
        <span className={["flex-1 truncate text-sm", hasUnread ? "font-medium text-slate-200" : "text-slate-400"].join(" ")}>
          {conversation.subject || "(no subject)"}
        </span>
        {conversation.message_count > 1 && (
          <span className="text-[10px] text-slate-500 shrink-0 bg-white/[0.04] px-1.5 py-0.5 rounded">
            {conversation.message_count}
          </span>
        )}
        {hasUnread && (
          <span className="text-[10px] font-semibold text-emerald-400 shrink-0">
            {conversation.unread_count}
          </span>
        )}
      </div>
    </button>
  );
}
