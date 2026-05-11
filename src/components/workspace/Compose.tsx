"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Input } from "@/src/components/ui";
import { RecipientInput } from "@/src/components/workspace/RecipientInput";
import { RichTextEditor } from "@/src/components/workspace/RichTextEditor";

type ComposeMode = "compose" | "reply" | "replyAll" | "forward";

const MODE_TITLES: Record<ComposeMode, string> = {
  compose: "New email",
  reply: "Reply",
  replyAll: "Reply all",
  forward: "Forward",
};

export function Compose({
  open,
  onClose,
  accountId,
  mode,
  initialTo,
  initialCc,
  initialSubject,
  initialBody,
  inReplyToMessageId,
  onSent,
}: {
  open: boolean;
  onClose: () => void;
  accountId: string;
  mode: ComposeMode;
  initialTo?: string[];
  initialCc?: string[];
  initialSubject?: string;
  initialBody?: string;
  inReplyToMessageId?: string;
  onSent?: () => void;
}) {
  const [to, setTo] = useState<string[]>([]);
  const [cc, setCc] = useState<string[]>([]);
  const [bcc, setBcc] = useState<string[]>([]);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize state when modal opens
  useEffect(() => {
    if (!open) return;
    setTo(initialTo ?? []);
    setCc(initialCc ?? []);
    setBcc([]);
    setSubject(initialSubject ?? "");
    setBody(initialBody ?? "");
    setShowCcBcc(!!(initialCc && initialCc.length > 0));
    setSending(false);
    setError(null);
  }, [open, initialTo, initialCc, initialSubject, initialBody]);

  const hasContent = to.length > 0 || subject.trim() !== "" || body.trim() !== "";

  const handleClose = useCallback(() => {
    if (hasContent && !sending) {
      if (!window.confirm("Discard this draft?")) return;
    }
    onClose();
  }, [hasContent, sending, onClose]);

  // ESC to close
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") handleClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, handleClose]);

  async function handleSend() {
    setError(null);

    if (to.length === 0) {
      setError("At least one recipient is required.");
      return;
    }
    if (!subject.trim()) {
      setError("Subject is required.");
      return;
    }
    if (!body.trim()) {
      setError("Message body is required.");
      return;
    }

    setSending(true);
    try {
      const res = await fetch("/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId,
          mode,
          to,
          cc: cc.length > 0 ? cc : undefined,
          bcc: bcc.length > 0 ? bcc : undefined,
          subject,
          body,
          inReplyToMessageId,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.message || data.error || "Failed to send email.");
        setSending(false);
        return;
      }

      onSent?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send email.");
      setSending(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={handleClose}
    >
      <div
        className="w-full max-w-3xl bg-elevated border border-white/[0.08] rounded-xl shadow-2xl flex flex-col"
        style={{ maxHeight: "85vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.06] bg-surface rounded-t-xl shrink-0">
          <h3 className="text-sm font-semibold text-slate-100">{MODE_TITLES[mode]}</h3>
          <button
            onClick={handleClose}
            className="text-slate-400 hover:text-slate-200 text-sm transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Form */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          <RecipientInput value={to} onChange={setTo} label="To" />

          {!showCcBcc && (
            <button
              type="button"
              onClick={() => setShowCcBcc(true)}
              className="text-xs text-emerald-400/70 hover:text-emerald-400 transition-colors ml-10"
            >
              Cc / Bcc
            </button>
          )}

          {showCcBcc && (
            <>
              <RecipientInput value={cc} onChange={setCc} label="Cc" />
              <RecipientInput value={bcc} onChange={setBcc} label="Bcc" />
            </>
          )}

          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-400 w-8 shrink-0">Subj</label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject"
            />
          </div>

          <RichTextEditor
            value={body}
            onChange={setBody}
            placeholder="Write your message…"
            minHeight={180}
          />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-white/[0.06] shrink-0">
          <div className="text-xs min-h-[1.25rem]">
            {sending && <span className="text-slate-400 italic">Sending…</span>}
            {error && <span className="text-red-400">{error}</span>}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={handleClose} disabled={sending}>
              Discard
            </Button>
            <Button onClick={handleSend} disabled={sending}>
              {sending ? "Sending…" : "Send"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
