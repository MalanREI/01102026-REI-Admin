"use client";

import { ContentType, BrandVoice } from "@/src/lib/types/social-media";

const PLATFORMS = [
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "tiktok", label: "TikTok" },
  { value: "youtube", label: "YouTube" },
  { value: "google_business", label: "Google Business" },
];

const MODEL_OPTIONS = [
  { value: "", label: "Auto (based on content type)" },
  { value: "gpt-4o", label: "GPT-4o" },
  { value: "claude-sonnet", label: "Claude Sonnet" },
];

type Props = {
  contentTypes: ContentType[];
  brandVoices: BrandVoice[];
  selectedContentTypeId: string;
  selectedBrandVoiceId: string;
  selectedPlatforms: string[];
  modelOverride: string;
  onContentTypeChange: (id: string) => void;
  onBrandVoiceChange: (id: string) => void;
  onPlatformsChange: (platforms: string[]) => void;
  onModelOverrideChange: (model: string) => void;
};

export function ConfigPanel({
  contentTypes,
  brandVoices,
  selectedContentTypeId,
  selectedBrandVoiceId,
  selectedPlatforms,
  modelOverride,
  onContentTypeChange,
  onBrandVoiceChange,
  onPlatformsChange,
  onModelOverrideChange,
}: Props) {
  function togglePlatform(value: string) {
    if (selectedPlatforms.includes(value)) {
      onPlatformsChange(selectedPlatforms.filter((p) => p !== value));
    } else {
      onPlatformsChange([...selectedPlatforms, value]);
    }
  }

  return (
    <div className="space-y-4 p-4">
      {/* Content Type */}
      <div>
        <label className="block text-xs font-medium text-slate-400 mb-1">Content Type</label>
        <select
          value={selectedContentTypeId}
          onChange={(e) => onContentTypeChange(e.target.value)}
          className="w-full rounded-lg border border-white/10 bg-base px-3 py-2 text-sm text-slate-200 outline-none focus:ring-2 focus:ring-emerald-500/40"
        >
          <option value="">Select content type…</option>
          {contentTypes.map((ct) => (
            <option key={ct.id} value={ct.id}>{ct.name}</option>
          ))}
        </select>
      </div>

      {/* Brand Voice */}
      <div>
        <label className="block text-xs font-medium text-slate-400 mb-1">Brand Voice</label>
        <select
          value={selectedBrandVoiceId}
          onChange={(e) => onBrandVoiceChange(e.target.value)}
          className="w-full rounded-lg border border-white/10 bg-base px-3 py-2 text-sm text-slate-200 outline-none focus:ring-2 focus:ring-emerald-500/40"
        >
          <option value="">Select brand voice…</option>
          {brandVoices.map((bv) => (
            <option key={bv.id} value={bv.id}>{bv.name}</option>
          ))}
        </select>
      </div>

      {/* Target Platforms */}
      <div>
        <label className="block text-xs font-medium text-slate-400 mb-2">Target Platforms</label>
        <div className="grid grid-cols-2 gap-1.5">
          {PLATFORMS.map((p) => (
            <label key={p.value} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={selectedPlatforms.includes(p.value)}
                onChange={() => togglePlatform(p.value)}
                className="rounded"
              />
              <span className="text-xs text-slate-300">{p.label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* AI Model Override */}
      <div>
        <label className="block text-xs font-medium text-slate-400 mb-1">AI Model</label>
        <select
          value={modelOverride}
          onChange={(e) => onModelOverrideChange(e.target.value)}
          className="w-full rounded-lg border border-white/10 bg-base px-3 py-2 text-sm text-slate-200 outline-none focus:ring-2 focus:ring-emerald-500/40"
        >
          {MODEL_OPTIONS.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
