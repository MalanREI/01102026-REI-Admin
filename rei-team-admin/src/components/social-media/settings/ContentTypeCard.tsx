"use client";
import { Button, Pill } from "@/src/components/ui";
import type { ContentType } from "@/src/lib/types/social-media";

export function ContentTypeCard({
  contentType,
  postCount,
  onEdit,
  onToggleActive,
  onDelete,
}: {
  contentType: ContentType;
  postCount?: number;
  onEdit: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
}) {
  const canDelete = !contentType.is_system && (postCount ?? 0) === 0;

  return (
    <div className="rounded-xl border border-white/[0.06] bg-surface p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          {contentType.icon && <span className="text-xl">{contentType.icon}</span>}
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-medium text-slate-200">{contentType.name}</h3>
              {contentType.is_system && <Pill>System</Pill>}
              {!contentType.is_active && <Pill>Inactive</Pill>}
            </div>
            <p className="text-xs text-slate-400 mt-0.5">{contentType.description}</p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 text-xs text-slate-500">
        <span>Model: {contentType.default_ai_model}</span>
        {postCount !== undefined && <span>• {postCount} posts</span>}
      </div>

      <div className="flex items-center gap-2">
        <Button variant="ghost" onClick={onEdit} className="text-xs px-2 py-1">Edit</Button>
        <Button variant="ghost" onClick={onToggleActive} className="text-xs px-2 py-1">
          {contentType.is_active ? "Deactivate" : "Activate"}
        </Button>
        {!contentType.is_system && (
          <Button
            variant="ghost"
            onClick={onDelete}
            disabled={!canDelete}
            className="text-xs px-2 py-1 text-red-400 hover:text-red-300 disabled:opacity-40"
            title={!canDelete && (postCount ?? 0) > 0 ? "Cannot delete: posts are assigned to this type" : undefined}
          >
            Delete
          </Button>
        )}
      </div>
    </div>
  );
}
