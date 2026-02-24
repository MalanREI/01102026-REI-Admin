"use client";
import { useState } from "react";
import { Input, Textarea, Button } from "@/src/components/ui";
import type { ContentType, BrandVoice } from "@/src/lib/types/social-media";

const AI_MODELS = [
  { value: "gpt-4o", label: "GPT-4o" },
  { value: "claude-sonnet-4-5", label: "Claude Sonnet 4.5" },
];

export function ContentTypeForm({
  initial,
  brandVoices,
  onSave,
  onCancel,
}: {
  initial?: Partial<ContentType>;
  brandVoices: BrandVoice[];
  onSave: (data: Partial<ContentType>) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    name: initial?.name ?? "",
    description: initial?.description ?? "",
    icon: initial?.icon ?? "",
    default_brand_voice_id: initial?.default_brand_voice_id ?? "",
    default_ai_model: initial?.default_ai_model ?? "gpt-4o",
    is_active: initial?.is_active ?? true,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { setError("Name is required"); return; }
    setLoading(true);
    setError("");
    try {
      await onSave({
        ...form,
        default_brand_voice_id: form.default_brand_voice_id || null,
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

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-xs text-slate-400">Name *</label>
          <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Daily Tips" required />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-slate-400">Icon (emoji)</label>
          <Input value={form.icon} onChange={(e) => set("icon", e.target.value)} placeholder="💡" maxLength={4} />
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-xs text-slate-400">Description</label>
        <Textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={2} placeholder="What this content type is for…" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-xs text-slate-400">Default Brand Voice</label>
          <select
            value={form.default_brand_voice_id}
            onChange={(e) => set("default_brand_voice_id", e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-base px-3 py-2 text-sm text-slate-200"
          >
            <option value="">None</option>
            {brandVoices.map((bv) => (
              <option key={bv.id} value={bv.id}>{bv.name}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-slate-400">Default AI Model</label>
          <select
            value={form.default_ai_model}
            onChange={(e) => set("default_ai_model", e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-base px-3 py-2 text-sm text-slate-200"
          >
            {AI_MODELS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>
      </div>

      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={form.is_active} onChange={(e) => set("is_active", e.target.checked)} className="rounded" />
        <span className="text-sm text-slate-300">Active</span>
      </label>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="ghost" type="button" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={loading}>{loading ? "Saving…" : "Save"}</Button>
      </div>
    </form>
  );
}
