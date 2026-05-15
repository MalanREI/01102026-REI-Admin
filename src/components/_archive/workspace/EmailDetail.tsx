"use client";

import { useEffect, useState } from "react";
import { Pill, Button } from "@/src/components/ui";
import { Compose } from "@/src/components/workspace/Compose";
import { EmailBodyView } from "@/src/components/workspace/EmailBodyView";
import { useWorkspace } from "@/src/components/workspace/WorkspaceContext";
import { formatEmailDateLong, formatFileSize } from "@/src/lib/format";
import { listEmailAttachmentsForEmail } from "@/src/lib/supabase/workspace-queries";
import type { Email, EmailAttachment } from "@/src/lib/types/workspace";

function recipientNames(addresses: Record<string, unknown>[] | null, max: number): string {
  if (!addresses || addresses.length === 0) return "";
  const names = addresses.map((r) => {
    const ea = r.emailAddress as { name?: string; address?: string } | undefined;
    return ea?.name || ea?.address || "Unknown";
  });
  if (names.length <= max) return names.join(", ");
  return `${names.slice(0, max).join(", ")} and ${names.length - max} more`;
}

function extractAddress(recipient: unknown): string | null {
  const r = recipient as { emailAddress?: { address?: string } } | undefined;
  return r?.emailAddress?.address ?? null;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function buildQuotedBody(original: Email): string {
  const intro = "<br><br>--- Original message ---<br>";
  const meta =
    `From: ${original.from_name ?? ""} &lt;${original.from_address ?? ""}&gt;<br>` +
    `Sent: ${formatEmailDateLong(original.sent_at)}<br>` +
    `Subject: ${original.subject ?? "(no subject)"}<br><br>`;
  const body = original.body_html ?? `<pre>${escapeHtml(original.body_text ?? "")}</pre>`;
  return intro + meta + body;
}

function unique(arr: (string | null)[]): string[] {
  return [...new Set(arr.filter((a): a is string => !!a))];
}

export function EmailDetail({
  email,
  onMarkRead,
  onStar,
  onUserState,
  onArchive,
  onTrash,
  onDelete,
}: {
  email: Email | null;
  onMarkRead?: (isRead: boolean) => void;
  onStar?: (isStarred: boolean) => void;
  onUserState?: (state: 'inbox' | 'handled' | 'followup' | 'snoozed' | null) => void;
  onArchive?: () => void;
  onTrash?: () => void;
  onDelete?: () => void;
}) {
  const { workspace } = useWorkspace();
  const [attachments, setAttachments] = useState<EmailAttachment[]>([]);
  const [loadingAttachments, setLoadingAttachments] = useState(false);
  // showHtml state moved into EmailBodyView
  const [composeMode, setComposeMode] = useState<"reply" | "replyAll" | "forward" | null>(null);

  useEffect(() => {
    if (!email?.has_attachments) {
      setAttachments([]);
      return;
    }
    setLoadingAttachments(true);
    listEmailAttachmentsForEmail(email.id)
      .then(setAttachments)
      .catch(() => setAttachments([]))
      .finally(() => setLoadingAttachments(false));
  }, [email?.id, email?.has_attachments]);

  // View mode state is now inside EmailBodyView

  if (!email) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-slate-500">Select an email to read.</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl p-6 space-y-4">
      {/* Header */}
      <div>
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-xl font-semibold text-slate-100">
            {email.subject || "(no subject)"}
          </h2>
          {/* Action bar */}
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="ghost" className="text-xs" onClick={() => setComposeMode("reply")}>
              Reply
            </Button>
            <Button variant="ghost" className="text-xs" onClick={() => setComposeMode("replyAll")}>
              Reply all
            </Button>
            <Button variant="ghost" className="text-xs" onClick={() => setComposeMode("forward")}>
              Forward
            </Button>
            {onArchive && (
              <Button variant="ghost" className="text-xs" onClick={onArchive}>
                📦 Archive
              </Button>
            )}
            {onTrash && (
              <Button variant="ghost" className="text-xs" onClick={onTrash}>
                🗑 Trash
              </Button>
            )}
            <div className="w-px h-4 bg-white/[0.08]" />
            {onMarkRead && (
              <Button
                variant="ghost"
                className="text-xs"
                onClick={() => onMarkRead(!email.is_read)}
              >
                {email.is_read ? "Mark unread" : "Mark read"}
              </Button>
            )}
            {onStar && (
              <Button
                variant="ghost"
                className="text-xs"
                onClick={() => onStar(!email.is_starred)}
              >
                {email.is_starred ? "Unstar" : "Star"}
              </Button>
            )}
            {onUserState && (
              <>
                <div className="w-px h-4 bg-white/[0.08]" />
                <Button
                  variant="ghost"
                  className={["text-xs", email.user_state === "handled" ? "text-emerald-400" : ""].join(" ")}
                  onClick={() => onUserState(email.user_state === "handled" ? null : "handled")}
                >
                  {email.user_state === "handled" ? "✓ Handled" : "Handled"}
                </Button>
                <Button
                  variant="ghost"
                  className={["text-xs", email.user_state === "followup" ? "text-amber-400" : ""].join(" ")}
                  onClick={() => onUserState(email.user_state === "followup" ? null : "followup")}
                >
                  {email.user_state === "followup" ? "⏰ Followup" : "Followup"}
                </Button>
              </>
            )}
            <a
              href={`https://outlook.live.com/mail/0/inbox/id/${encodeURIComponent(email.provider_message_id)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-slate-400 hover:text-slate-200 transition-colors"
            >
              Open in Outlook
            </a>
          </div>
        </div>

        <div className="mt-2 space-y-1">
          <p className="text-sm text-slate-300">
            From <span className="font-medium">{email.from_name || email.from_address}</span>
            {email.from_name && email.from_address && (
              <span className="text-slate-500"> &lt;{email.from_address}&gt;</span>
            )}
          </p>
          {email.to_addresses && (
            <p className="text-sm text-slate-400">
              To {recipientNames(email.to_addresses as Record<string, unknown>[], 2)}
            </p>
          )}
          <div className="flex items-center gap-2">
            <p className="text-xs text-slate-500">{formatEmailDateLong(email.sent_at)}</p>
            {email.folder_id && <Pill>{email.folder_id}</Pill>}
            {email.triage_category && <Pill>{email.triage_category.replace(/_/g, " ")}</Pill>}
          </div>
        </div>
      </div>

      {/* Attachments */}
      {email.has_attachments && (
        <div>
          <p className="text-xs text-slate-400 mb-2">
            Attachments {loadingAttachments ? "(loading…)" : `(${attachments.length})`}
          </p>
          <div className="space-y-1">
            {attachments.map((att) => (
              <div
                key={att.id}
                className="flex items-center gap-2 bg-white/[0.03] rounded-lg p-2"
              >
                <span className="text-sm">📎</span>
                <span className="text-sm text-slate-200 truncate flex-1">
                  {att.file_name || "unnamed"}
                </span>
                {att.size_bytes != null && (
                  <span className="text-xs text-slate-500 shrink-0">
                    {formatFileSize(att.size_bytes)}
                  </span>
                )}
                {att.mime_type && <Pill>{att.mime_type.split("/").pop()}</Pill>}
                {att.extraction_status === "pending" && (
                  <span className="text-[10px] text-slate-600 italic">Text not extracted yet</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Body */}
      <EmailBodyView bodyHtml={email.body_html} bodyText={email.body_text} snippet={email.snippet} />

      {/* Compose modal for reply/replyAll/forward */}
      {composeMode && (() => {
        const myAddr = workspace.email_address.toLowerCase();
        const quotedBody = buildQuotedBody(email);
        let initTo: string[] = [];
        let initCc: string[] = [];
        let initSubject = email.subject ?? "";

        if (composeMode === "reply") {
          initTo = email.from_address ? [email.from_address] : [];
          initSubject = initSubject.toLowerCase().startsWith("re:") ? initSubject : `Re: ${initSubject}`;
        } else if (composeMode === "replyAll") {
          initTo = unique([
            email.from_address,
            ...((email.to_addresses ?? []) as Record<string, unknown>[]).map(extractAddress),
          ].filter((a) => a?.toLowerCase() !== myAddr));
          initCc = ((email.cc_addresses ?? []) as Record<string, unknown>[])
            .map(extractAddress)
            .filter((a): a is string => !!a && a.toLowerCase() !== myAddr);
          initSubject = initSubject.toLowerCase().startsWith("re:") ? initSubject : `Re: ${initSubject}`;
        } else {
          initTo = [];
          initSubject = initSubject.toLowerCase().startsWith("fwd:") ? initSubject : `Fwd: ${initSubject}`;
        }

        return (
          <Compose
            open
            onClose={() => setComposeMode(null)}
            accountId={workspace.id}
            mode={composeMode}
            initialTo={initTo}
            initialCc={initCc}
            initialSubject={initSubject}
            initialBody={quotedBody}
            inReplyToMessageId={email.provider_message_id}
          />
        );
      })()}
    </div>
  );
}
