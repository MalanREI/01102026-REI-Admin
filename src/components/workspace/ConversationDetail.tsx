"use client";

import { useEffect, useState } from "react";
import { Button, Pill } from "@/src/components/ui";
import { Compose } from "@/src/components/workspace/Compose";
import { useWorkspace } from "@/src/components/workspace/WorkspaceContext";
import { getConversation, listEmailsInConversation, listEmailAttachmentsForEmail } from "@/src/lib/supabase/workspace-queries";
import { formatEmailDateLong, formatFileSize } from "@/src/lib/format";
import type { Email, EmailAttachment, Conversation, EmailUserState } from "@/src/lib/types/workspace";

function extractAddress(r: unknown): string | null {
  return (r as { emailAddress?: { address?: string } })?.emailAddress?.address ?? null;
}

function unique(arr: (string | null)[]): string[] {
  return [...new Set(arr.filter((a): a is string => !!a))];
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function EmailInThread({ email, expanded, onToggle }: { email: Email; expanded: boolean; onToggle: () => void }) {
  const [attachments, setAttachments] = useState<EmailAttachment[]>([]);

  useEffect(() => {
    if (!expanded || !email.has_attachments) { setAttachments([]); return; }
    listEmailAttachmentsForEmail(email.id).then(setAttachments).catch(() => setAttachments([]));
  }, [expanded, email.id, email.has_attachments]);

  return (
    <div className="border border-white/[0.06] rounded-lg overflow-hidden">
      {/* Header — always visible */}
      <button type="button" onClick={onToggle} className="w-full flex items-center gap-3 p-3 text-left hover:bg-white/[0.02] transition-colors">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-200 truncate">
              {email.from_name || email.from_address || "Unknown"}
            </span>
            {email.has_attachments && <span className="text-xs text-slate-500">📎</span>}
          </div>
          <p className="text-xs text-slate-500 truncate">{formatEmailDateLong(email.sent_at)}</p>
        </div>
        <span className="text-xs text-slate-500">{expanded ? "▾" : "▸"}</span>
      </button>

      {/* Body — visible when expanded */}
      {expanded && (
        <div className="border-t border-white/[0.06] p-4 space-y-3">
          <p className="text-xs text-slate-400">
            To: {(email.to_addresses as Record<string, unknown>[] ?? []).map(extractAddress).filter(Boolean).join(", ")}
          </p>

          {attachments.length > 0 && (
            <div className="space-y-1">
              {attachments.map((att) => (
                <div key={att.id} className="flex items-center gap-2 bg-white/[0.03] rounded p-2 text-xs">
                  <span>📎</span>
                  <span className="text-slate-200 truncate flex-1">{att.file_name}</span>
                  {att.size_bytes != null && <span className="text-slate-500">{formatFileSize(att.size_bytes)}</span>}
                </div>
              ))}
            </div>
          )}

          {email.body_text ? (
            <pre className="whitespace-pre-wrap text-sm font-sans text-slate-300">{email.body_text}</pre>
          ) : email.snippet ? (
            <p className="text-sm text-slate-500 italic">{email.snippet}</p>
          ) : null}
        </div>
      )}
    </div>
  );
}

export function ConversationDetail({
  conversationId,
  onMoveAction,
  onUserState,
}: {
  conversationId: string | null;
  onMoveAction?: (action: "archive" | "trash" | "delete") => void;
  onUserState?: (state: EmailUserState | null, options?: { followupDueAt?: Date | null; snoozedUntil?: Date | null }) => void;
}) {
  const { workspace } = useWorkspace();
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [emails, setEmails] = useState<Email[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [composeMode, setComposeMode] = useState<"reply" | "replyAll" | "forward" | null>(null);

  useEffect(() => {
    if (!conversationId) { setConversation(null); setEmails([]); return; }
    setLoading(true);
    Promise.all([getConversation(conversationId), listEmailsInConversation(conversationId)])
      .then(([conv, msgs]) => {
        setConversation(conv);
        setEmails(msgs);
        // Expand newest by default
        if (msgs.length > 0) setExpandedIds(new Set([msgs[msgs.length - 1].id]));
      })
      .catch(() => { setConversation(null); setEmails([]); })
      .finally(() => setLoading(false));
  }, [conversationId]);

  if (!conversationId) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-slate-500">Select a conversation to read.</p>
      </div>
    );
  }

  if (loading) {
    return <div className="p-6 text-sm text-slate-500 italic">Loading…</div>;
  }

  if (!conversation) {
    return <div className="p-6 text-sm text-slate-500">Conversation not found.</div>;
  }

  const newest = emails.length > 0 ? emails[emails.length - 1] : null;
  const myEmail = workspace.email_address.toLowerCase();

  // Reply context from newest email
  function getReplyContext(mode: "reply" | "replyAll" | "forward") {
    if (!newest) return {};
    const subject = newest.subject ?? "";
    if (mode === "reply") {
      return {
        initialTo: newest.from_address ? [newest.from_address] : [],
        initialSubject: subject.toLowerCase().startsWith("re:") ? subject : `Re: ${subject}`,
        initialBody: buildQuote(newest),
        inReplyToMessageId: newest.provider_message_id,
      };
    }
    if (mode === "replyAll") {
      const allTo = unique([
        newest.from_address,
        ...((newest.to_addresses ?? []) as Record<string, unknown>[]).map(extractAddress),
      ].filter((a) => a?.toLowerCase() !== myEmail));
      const allCc = ((newest.cc_addresses ?? []) as Record<string, unknown>[])
        .map(extractAddress).filter((a): a is string => !!a && a.toLowerCase() !== myEmail);
      return {
        initialTo: allTo,
        initialCc: allCc,
        initialSubject: subject.toLowerCase().startsWith("re:") ? subject : `Re: ${subject}`,
        initialBody: buildQuote(newest),
        inReplyToMessageId: newest.provider_message_id,
      };
    }
    return {
      initialTo: [],
      initialSubject: subject.toLowerCase().startsWith("fwd:") ? subject : `Fwd: ${subject}`,
      initialBody: buildQuote(newest),
      inReplyToMessageId: newest.provider_message_id,
    };
  }

  function buildQuote(e: Email): string {
    const intro = "<br><br>--- Original message ---<br>";
    const meta = `From: ${e.from_name ?? ""} &lt;${e.from_address ?? ""}&gt;<br>` +
      `Sent: ${formatEmailDateLong(e.sent_at)}<br>` +
      `Subject: ${e.subject ?? "(no subject)"}<br><br>`;
    const body = e.body_html ?? `<pre>${escapeHtml(e.body_text ?? "")}</pre>`;
    return intro + meta + body;
  }

  const reversed = [...emails].reverse();

  return (
    <div className="p-6 space-y-4 max-w-3xl">
      {/* Action bar */}
      <div className="flex items-start justify-between gap-4">
        <h2 className="text-xl font-semibold text-slate-100">{conversation.subject || "(no subject)"}</h2>
        <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
          <Button variant="ghost" className="text-xs" onClick={() => setComposeMode("reply")}>Reply</Button>
          <Button variant="ghost" className="text-xs" onClick={() => setComposeMode("replyAll")}>Reply all</Button>
          <Button variant="ghost" className="text-xs" onClick={() => setComposeMode("forward")}>Forward</Button>
          <div className="w-px h-4 bg-white/[0.08]" />
          {onMoveAction && (
            <>
              <Button variant="ghost" className="text-xs" onClick={() => onMoveAction("archive")}>📦 Archive</Button>
              <Button variant="ghost" className="text-xs" onClick={() => onMoveAction("trash")}>🗑 Trash</Button>
            </>
          )}
          <div className="w-px h-4 bg-white/[0.08]" />
          {onUserState && (
            <>
              <Button
                variant="ghost"
                className={["text-xs", conversation.user_state === "handled" ? "text-emerald-400" : ""].join(" ")}
                onClick={() => onUserState(conversation.user_state === "handled" ? null : "handled")}
              >
                {conversation.user_state === "handled" ? "✓ Handled" : "Mark handled"}
              </Button>
              <Button
                variant="ghost"
                className={["text-xs", conversation.user_state === "followup" ? "text-amber-400" : ""].join(" ")}
                onClick={() => onUserState(conversation.user_state === "followup" ? null : "followup", {
                  followupDueAt: conversation.user_state !== "followup" ? new Date(Date.now() + 86400000) : null,
                })}
              >
                {conversation.user_state === "followup" ? "⏰ Follow-up" : "Needs follow-up"}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Metadata */}
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <span>{conversation.message_count} message{conversation.message_count !== 1 ? "s" : ""}</span>
        {conversation.primary_folder_id && <Pill>{conversation.primary_folder_id}</Pill>}
        {conversation.user_state && <Pill>{conversation.user_state}</Pill>}
      </div>

      {/* Thread */}
      <div className="space-y-2">
        {reversed.map((email) => (
          <EmailInThread
            key={email.id}
            email={email}
            expanded={expandedIds.has(email.id)}
            onToggle={() => setExpandedIds((prev) => {
              const next = new Set(prev);
              if (next.has(email.id)) next.delete(email.id); else next.add(email.id);
              return next;
            })}
          />
        ))}
      </div>

      {/* Compose modal */}
      {composeMode && (() => {
        const ctx = getReplyContext(composeMode);
        return (
          <Compose
            open
            onClose={() => setComposeMode(null)}
            accountId={workspace.id}
            mode={composeMode}
            {...ctx}
          />
        );
      })()}
    </div>
  );
}
