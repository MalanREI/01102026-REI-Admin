"use client";
import type { ContentPostWithRelations } from "@/src/lib/types/social-media";
import { StatusBadge } from "./StatusBadge";

const PLATFORM_ICONS: Record<string, string> = {
  instagram: "📸",
  facebook: "👥",
  linkedin: "💼",
  tiktok: "🎵",
  youtube: "▶️",
  google_business: "🏢",
};

export function PostCard({ post, onClick }: { post: ContentPostWithRelations; onClick: () => void }) {
  const preview = post.title || post.body.slice(0, 100) + (post.body.length > 100 ? "…" : "");
  const thumbnail = post.media_urls?.[0];

  return (
    <div
      onClick={onClick}
      className="cursor-pointer rounded-xl border border-white/[0.06] bg-surface hover:bg-elevated transition-colors overflow-hidden"
    >
      {thumbnail && (
        <div className="h-32 overflow-hidden bg-black/20">
          <img src={thumbnail} alt="" className="w-full h-full object-cover" />
        </div>
      )}
      <div className="p-3 space-y-2">
        {post.content_type && (
          <span className="inline-flex items-center gap-1 text-xs text-slate-400">
            {post.content_type.icon && <span>{post.content_type.icon}</span>}
            <span>{post.content_type.name}</span>
          </span>
        )}
        <p className="text-sm text-slate-200 line-clamp-3">{preview}</p>
        <div className="flex items-center gap-1">
          {post.target_platforms.map((p) => (
            <span key={p} title={p} className="text-sm">
              {PLATFORM_ICONS[p] ?? "🌐"}
            </span>
          ))}
        </div>
        <div className="flex items-center justify-between gap-2">
          <StatusBadge status={post.status} />
          <span className="text-xs text-slate-500">
            {new Date(post.created_at).toLocaleDateString()}
          </span>
        </div>
        {post.created_by_member && (
          <div className="text-xs text-slate-500">{post.created_by_member.display_name}</div>
        )}
      </div>
    </div>
  );
}
