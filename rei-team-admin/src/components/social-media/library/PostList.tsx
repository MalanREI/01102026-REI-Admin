"use client";
import type { ContentPostWithRelations } from "@/src/lib/types/social-media";
import { PostListRow } from "./PostListRow";

export function PostList({
  posts,
  selected,
  onSelect,
  onPostClick,
  onDeletePost,
  sortBy,
  sortDir,
  onSort,
}: {
  posts: ContentPostWithRelations[];
  selected: Set<string>;
  onSelect: (id: string, checked: boolean) => void;
  onPostClick: (id: string) => void;
  onDeletePost: (id: string) => void;
  sortBy: string;
  sortDir: "asc" | "desc";
  onSort: (col: string) => void;
}) {
  const SortHeader = ({ col, label }: { col: string; label: string }) => (
    <th
      className="px-3 py-2 text-xs font-medium text-slate-400 text-left cursor-pointer hover:text-slate-200 select-none"
      onClick={() => onSort(col)}
    >
      {label} {sortBy === col ? (sortDir === "asc" ? "↑" : "↓") : ""}
    </th>
  );

  return (
    <div className="overflow-x-auto rounded-xl border border-white/[0.06]">
      <table className="w-full bg-surface">
        <thead className="bg-elevated border-b border-white/[0.06]">
          <tr>
            <th className="px-3 py-2 w-8"></th>
            <SortHeader col="title" label="Title" />
            <th className="px-3 py-2 text-xs font-medium text-slate-400 text-left">Type</th>
            <th className="px-3 py-2 text-xs font-medium text-slate-400 text-left">Platforms</th>
            <SortHeader col="status" label="Status" />
            <th className="px-3 py-2 text-xs font-medium text-slate-400 text-left">Creator</th>
            <SortHeader col="created_at" label="Date" />
            <th className="px-3 py-2 text-xs font-medium text-slate-400 text-left">Actions</th>
          </tr>
        </thead>
        <tbody>
          {posts.map((post) => (
            <PostListRow
              key={post.id}
              post={post}
              checked={selected.has(post.id)}
              onCheck={(checked) => onSelect(post.id, checked)}
              onView={() => onPostClick(post.id)}
              onDelete={() => onDeletePost(post.id)}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
