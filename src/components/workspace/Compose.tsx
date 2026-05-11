"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Input } from "@/src/components/ui";
import { RecipientInput } from "@/src/components/workspace/RecipientInput";
import { RichTextEditor } from "@/src/components/workspace/RichTextEditor";
import { SignatureManager } from "@/src/components/workspace/SignatureManager";
import { listSignatures, upsertDraft, deleteDraftById } from "@/src/lib/supabase/workspace-queries";
import { formatFileSize } from "@/src/lib/format";
import type { EmailSignature, DraftAttachment } from "@/src/lib/types/workspace";

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
  const [signatures, setSignatures] = useState<EmailSignature[]>([]);
  const [selectedSigId, setSelectedSigId] = useState<string | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<DraftAttachment[]>([]);
  const [manageSignaturesOpen, setManageSignaturesOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const autoSaveRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load signatures
  useEffect(() => {
    if (!open) return;
    listSignatures(accountId)
      .then((sigs) => {
        setSignatures(sigs);
        const def = sigs.find((s) => s.is_default);
        if (def) setSelectedSigId(def.id);
      })
      .catch(() => setSignatures([]));
  }, [open, accountId]);

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
    setDraftId(null);
    setAttachments([]);
  }, [open, initialTo, initialCc, initialSubject, initialBody]);

  // Auto-save draft every 5 seconds
  useEffect(() => {
    if (!open) {
      if (autoSaveRef.current) clearInterval(autoSaveRef.current);
      return;
    }
    autoSaveRef.current = setInterval(async () => {
      if (sending) return;
      const hasAny = to.length > 0 || subject.trim() || body.trim();
      if (!hasAny) return;
      try {
        const saved = await upsertDraft({
          id: draftId ?? crypto.randomUUID(),
          user_id: "", // RLS handles this
          account_id: accountId,
          mode,
          in_reply_to_message_id: inReplyToMessageId ?? null,
          to_addresses: to,
          cc_addresses: cc,
          bcc_addresses: bcc,
          subject,
          body_html: body,
          signature_id: selectedSigId,
        });
        if (!draftId) setDraftId(saved.id);
      } catch { /* auto-save is best-effort */ }
    }, 5000);
    return () => { if (autoSaveRef.current) clearInterval(autoSaveRef.current); };
  }, [open, sending, to, cc, bcc, subject, body, draftId, accountId, mode, inReplyToMessageId, selectedSigId]);

  const hasContent = to.length > 0 || subject.trim() !== "" || body.trim() !== "";

  const handleClose = useCallback(() => {
    if (hasContent && !sending) {
      if (!window.confirm("Discard this draft?")) return;
    }
    // Clean up draft on discard
    if (draftId) deleteDraftById(draftId).catch(() => {});
    onClose();
  }, [hasContent, sending, onClose, draftId]);

  // ESC to close, Cmd+Enter to send
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") handleClose();
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        handleSend();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, handleClose]);

  function refetchSignatures() {
    listSignatures(accountId).then(setSignatures).catch(() => {});
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || !draftId) { setError("Save your draft first before attaching files."); return; }
    for (const file of Array.from(files)) {
      const formData = new FormData();
      formData.append("draftId", draftId);
      formData.append("file", file);
      const res = await fetch("/api/email/draft/attachment", { method: "POST", body: formData });
      if (res.ok) {
        const data = await res.json();
        setAttachments((prev) => [...prev, data]);
      } else {
        setError("Upload failed: " + file.name);
      }
    }
    e.target.value = "";
  }

  async function removeAttachment(attachmentId: string) {
    const res = await fetch("/api/email/draft/attachment", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attachmentId }),
    });
    if (res.ok) setAttachments((prev) => prev.filter((a) => a.id !== attachmentId));
  }

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

    // Append signature if selected
    const sig = signatures.find((s) => s.id === selectedSigId);
    const finalBody = sig ? body + "<br><br>--<br>" + sig.body_html : body;

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
          body: finalBody,
          inReplyToMessageId,
          draftId: draftId ?? undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.message || data.error || "Failed to send email.");
        setSending(false);
        return;
      }

      // Clean up draft on successful send
      if (draftId) deleteDraftById(draftId).catch(() => {});
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

          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-400 w-8 shrink-0">Sig</label>
            <select
              value={selectedSigId ?? ""}
              onChange={(e) => setSelectedSigId(e.target.value || null)}
              className="flex-1 rounded-lg border border-white/10 bg-base px-3 py-2 text-sm text-slate-200 outline-none"
            >
              <option value="">No signature</option>
              {signatures.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <button onClick={() => setManageSignaturesOpen(true)} className="text-xs text-emerald-400 hover:text-emerald-300 shrink-0">
              Manage
            </button>
            <input ref={fileInputRef} type="file" multiple style={{ display: "none" }} onChange={handleFileSelect} />
            <button onClick={() => fileInputRef.current?.click()} className="text-xs px-2 py-1 rounded border border-white/10 hover:bg-white/[0.05] text-slate-300 shrink-0">
              📎 Attach
            </button>
          </div>

          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {attachments.map((a) => (
                <div key={a.id} className="flex items-center gap-2 px-3 py-1 bg-white/[0.05] rounded text-xs text-slate-300">
                  📎 {a.file_name} ({formatFileSize(a.size_bytes)})
                  <button onClick={() => removeAttachment(a.id)} className="text-slate-500 hover:text-slate-200">×</button>
                </div>
              ))}
            </div>
          )}

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

      <SignatureManager
        open={manageSignaturesOpen}
        onClose={() => setManageSignaturesOpen(false)}
        accountId={accountId}
        onChange={refetchSignatures}
      />
    </div>
  );
}
