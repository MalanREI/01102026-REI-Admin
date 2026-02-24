"use client";

import { useState, useEffect } from "react";
import { PlatformPreviewTab } from "./PlatformPreviewTab";

const PLATFORM_LABELS: Record<string, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  tiktok: "TikTok",
  youtube: "YouTube",
  google_business: "Google",
};

type Props = {
  content: string;
  imageUrl?: string;
  targetPlatforms: string[];
  onEditContent: (content: string) => void;
};

export function PostPreview({ content, imageUrl, targetPlatforms, onEditContent }: Props) {
  const platforms = targetPlatforms.length > 0 ? targetPlatforms : ["instagram"];
  const [activeTab, setActiveTab] = useState(platforms[0]);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(content);

  // Sync edit value when content changes externally
  useEffect(() => {
    if (!isEditing) {
      setEditValue(content);
    }
  }, [content, isEditing]);

  function handleSaveEdit() {
    onEditContent(editValue);
    setIsEditing(false);
  }

  return (
    <div className="space-y-3 p-4">
      {/* Platform tabs */}
      <div className="flex gap-1 flex-wrap">
        {platforms.map((p) => (
          <button
            key={p}
            onClick={() => setActiveTab(p)}
            className={`px-2 py-1 text-xs rounded-lg font-medium transition-colors ${
              activeTab === p
                ? "bg-emerald-600 text-white"
                : "text-slate-400 hover:text-slate-200 bg-white/[0.04] hover:bg-white/[0.06]"
            }`}
          >
            {PLATFORM_LABELS[p] ?? p}
          </button>
        ))}
      </div>

      {/* Preview or editor */}
      {isEditing ? (
        <div className="space-y-2">
          <textarea
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            rows={8}
            className="w-full rounded-lg border border-white/10 bg-base px-3 py-2 text-sm text-slate-200 outline-none focus:ring-2 focus:ring-emerald-500/40 resize-none"
          />
          <div className="flex gap-2">
            <button
              onClick={handleSaveEdit}
              className="rounded-lg px-3 py-1.5 text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-500"
            >
              Save
            </button>
            <button
              onClick={() => { setEditValue(content); setIsEditing(false); }}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-slate-200 bg-white/[0.04] border border-white/10"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <PlatformPreviewTab platform={activeTab} content={content} imageUrl={imageUrl} />
          {content && (
            <button
              onClick={() => setIsEditing(true)}
              className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
            >
              ✏ Edit content
            </button>
          )}
        </>
      )}
    </div>
  );
}
