"use client";

import { useEffect, useState } from "react";
import { Button, Input } from "@/src/components/ui";
import { RichTextEditor } from "@/src/components/workspace/RichTextEditor";
import { listSignatures } from "@/src/lib/supabase/workspace-queries";
import type { EmailSignature } from "@/src/lib/types/workspace";

export function SignatureManager({
  open,
  onClose,
  accountId,
  onChange,
}: {
  open: boolean;
  onClose: () => void;
  accountId: string;
  onChange?: () => void;
}) {
  const [signatures, setSignatures] = useState<EmailSignature[]>([]);
  const [editingId, setEditingId] = useState<string | null | "new">(null);
  const [draftName, setDraftName] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [draftIsDefault, setDraftIsDefault] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    listSignatures(accountId).then(setSignatures).catch(() => setSignatures([]));
    setEditingId(null);
  }, [open, accountId]);

  function startEdit(sig: EmailSignature) {
    setEditingId(sig.id);
    setDraftName(sig.name);
    setDraftBody(sig.body_html);
    setDraftIsDefault(sig.is_default);
  }

  function startNew() {
    setEditingId("new");
    setDraftName("");
    setDraftBody("");
    setDraftIsDefault(false);
  }

  async function handleSave() {
    if (!draftName.trim() || !draftBody.trim()) return;
    setSaving(true);
    const method = editingId === "new" ? "POST" : "PATCH";
    const body = editingId === "new"
      ? { accountId, name: draftName, body_html: draftBody, is_default: draftIsDefault }
      : { signatureId: editingId, name: draftName, body_html: draftBody, is_default: draftIsDefault };

    await fetch("/api/signature", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const refreshed = await listSignatures(accountId);
    setSignatures(refreshed);
    setEditingId(null);
    setSaving(false);
    onChange?.();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this signature?")) return;
    await fetch("/api/signature", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ signatureId: id }),
    });
    const refreshed = await listSignatures(accountId);
    setSignatures(refreshed);
    onChange?.();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-2xl bg-elevated border border-white/[0.08] rounded-xl shadow-2xl flex flex-col" style={{ maxHeight: "80vh" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.06] bg-surface rounded-t-xl">
          <h3 className="text-sm font-semibold text-slate-100">Manage Signatures</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 text-sm">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {signatures.map((sig) => (
            <div key={sig.id} className="border border-white/[0.06] rounded-lg p-3">
              {editingId === sig.id ? (
                <div className="space-y-2">
                  <Input value={draftName} onChange={(e) => setDraftName(e.target.value)} placeholder="Signature name" />
                  <RichTextEditor value={draftBody} onChange={setDraftBody} minHeight={80} placeholder="Signature content…" />
                  <label className="flex items-center gap-2 text-xs text-slate-300">
                    <input type="checkbox" checked={draftIsDefault} onChange={(e) => setDraftIsDefault(e.target.checked)} />
                    Set as default
                  </label>
                  <div className="flex gap-2">
                    <Button onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
                    <Button variant="ghost" onClick={() => setEditingId(null)}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-slate-200">{sig.name} {sig.is_default && <span className="text-[10px] text-emerald-400">(default)</span>}</p>
                    <p className="text-xs text-slate-500 mt-1 line-clamp-2">{sig.body_html.replace(/<[^>]+>/g, " ").slice(0, 100)}</p>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <button onClick={() => startEdit(sig)} className="text-xs text-slate-400 hover:text-slate-200">Edit</button>
                    <button onClick={() => handleDelete(sig.id)} className="text-xs text-red-400 hover:text-red-300">Delete</button>
                  </div>
                </div>
              )}
            </div>
          ))}

          {editingId === "new" ? (
            <div className="border border-white/[0.06] rounded-lg p-3 space-y-2">
              <Input value={draftName} onChange={(e) => setDraftName(e.target.value)} placeholder="Signature name" />
              <RichTextEditor value={draftBody} onChange={setDraftBody} minHeight={80} placeholder="Signature content…" />
              <label className="flex items-center gap-2 text-xs text-slate-300">
                <input type="checkbox" checked={draftIsDefault} onChange={(e) => setDraftIsDefault(e.target.checked)} />
                Set as default
              </label>
              <div className="flex gap-2">
                <Button onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
                <Button variant="ghost" onClick={() => setEditingId(null)}>Cancel</Button>
              </div>
            </div>
          ) : (
            <button onClick={startNew} className="text-xs text-emerald-400 hover:text-emerald-300">
              + New signature
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
