"use client";
import type { ContentPostWithRelations } from "@/src/lib/types/social-media";
import { StatusBadge } from "./StatusBadge";
import { Button } from "@/src/components/ui";

const PLATFORM_ICONS: Record<string, string> = {
  instagram: "📸",
  facebook: "👥",
  linkedin: "💼",
  tiktok: "🎵",
  youtube: "▶️",
  google_business: "🏢",
};

export function PostListRow({
  post,
  checked,
  onCheck,
  onView,
  onDelete,
}: {
  post: ContentPostWithRelations;
  checked: boolean;
  onCheck: (checked: boolean) => void;
  onView: () => void;
  onDelete: () => void;
}) {
  const title = post.title || post.body.slice(0, 80) + (post.body.length > 80 ? "…" : "");

  return (
    <tr className="border-b border-white/[0.06] hover:bg-elevated transition-colors">
      <td className="px-3 py-3">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onCheck(e.target.checked)}
          className="rounded"
        />
      </td>
      <td className="px-3 py-3 text-sm text-slate-200 max-w-xs truncate">{title}</td>
      <td className="px-3 py-3 text-xs text-slate-400">
        {post.content_type ? (
          <span className="flex items-center gap-1">
            {post.content_type.icon && <span>{post.content_type.icon}</span>}
            {post.content_type.name}
          </span>
        ) : (
          <span className="text-slate-600">—</span>
        )}
      </td>
      <td className="px-3 py-3">
        <div className="flex items-center gap-1">
          {post.target_platforms.map((p) => (
            <span key={p} title={p} className="text-sm">
              {PLATFORM_ICONS[p] ?? "🌐"}
            </span>
          ))}
        </div>
      </td>
      <td className="px-3 py-3">
        <StatusBadge status={post.status} />
      </td>
      <td className="px-3 py-3 text-xs text-slate-400">
        {post.created_by_member?.display_name ?? <span className="text-slate-600">—</span>}
      </td>
      <td className="px-3 py-3 text-xs text-slate-500">
        {new Date(post.created_at).toLocaleDateString()}
      </td>
      <td className="px-3 py-3">
        <div className="flex items-center gap-1">
          <Button variant="ghost" onClick={onView} className="px-2 py-1 text-xs">View</Button>
          <Button variant="ghost" onClick={onDelete} className="px-2 py-1 text-xs text-red-400 hover:text-red-300">Delete</Button>
        </div>
      </td>
    </tr>
  );
}
