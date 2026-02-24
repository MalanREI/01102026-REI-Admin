"use client";
import { useState } from "react";
import { Input, Textarea, Button } from "@/src/components/ui";
import type { BrandVoice } from "@/src/lib/types/social-media";

export function BrandVoiceForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: Partial<BrandVoice>;
  onSave: (data: Partial<BrandVoice>) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    name: initial?.name ?? "",
    description: initial?.description ?? "",
    system_prompt: initial?.system_prompt ?? "",
    example_content: initial?.example_content ?? "",
    is_default: initial?.is_default ?? false,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { setError("Name is required"); return; }
    if (!form.system_prompt.trim()) { setError("System prompt is required"); return; }
    setLoading(true);
    setError("");
    try {
      await onSave({
        ...form,
        example_content: form.example_content || null,
      });
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <div className="text-xs text-red-400 bg-red-900/20 rounded px-3 py-2">{error}</div>}

      <div className="space-y-1">
        <label className="text-xs text-slate-400">Name *</label>
        <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Educational" required />
      </div>

      <div className="space-y-1">
        <label className="text-xs text-slate-400">Description</label>
        <Input value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="Brief description of this voice" />
      </div>

      <div className="space-y-1">
        <label className="text-xs text-slate-400">System Prompt *</label>
        <Textarea
          value={form.system_prompt}
          onChange={(e) => set("system_prompt", e.target.value)}
          rows={6}
          placeholder="You are a real estate content writer with an educational tone…"
          required
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs text-slate-400">Example Content</label>
        <Textarea
          value={form.example_content}
          onChange={(e) => set("example_content", e.target.value)}
          rows={3}
          placeholder="Sample post in this voice style…"
        />
      </div>

      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={form.is_default} onChange={(e) => set("is_default", e.target.checked)} className="rounded" />
        <span className="text-sm text-slate-300">Set as Default Voice</span>
      </label>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="ghost" type="button" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={loading}>{loading ? "Saving…" : "Save"}</Button>
      </div>
    </form>
  );
}
