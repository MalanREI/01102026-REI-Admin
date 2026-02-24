"use client";
import { Button, Pill } from "@/src/components/ui";
import type { BrandVoice } from "@/src/lib/types/social-media";

export function BrandVoiceCard({
  voice,
  postCount,
  onEdit,
  onDelete,
  onTest,
}: {
  voice: BrandVoice;
  postCount?: number;
  onEdit: () => void;
  onDelete: () => void;
  onTest: () => void;
}) {
  const canDelete = (postCount ?? 0) === 0 && !voice.is_default;

  return (
    <div className="rounded-xl border border-white/[0.06] bg-surface p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium text-slate-200">{voice.name}</h3>
            {voice.is_default && <Pill>Default</Pill>}
          </div>
          <p className="text-xs text-slate-400 mt-0.5">{voice.description}</p>
        </div>
      </div>

      {voice.example_content && (
        <div className="rounded-lg bg-elevated border border-white/[0.06] px-3 py-2">
          <p className="text-xs text-slate-400 italic line-clamp-3">&quot;{voice.example_content}&quot;</p>
        </div>
      )}

      <div className="text-xs text-slate-500">
        {postCount !== undefined && <span>{postCount} posts</span>}
      </div>

      <div className="flex items-center gap-2">
        <Button variant="ghost" onClick={onEdit} className="text-xs px-2 py-1">Edit</Button>
        <Button variant="ghost" onClick={onTest} className="text-xs px-2 py-1">Test Voice</Button>
        <Button
          variant="ghost"
          onClick={onDelete}
          disabled={!canDelete}
          className="text-xs px-2 py-1 text-red-400 hover:text-red-300 disabled:opacity-40"
          title={!canDelete ? (voice.is_default ? "Cannot delete default voice" : "Posts assigned to this voice") : undefined}
        >
          Delete
        </Button>
      </div>
    </div>
  );
}
