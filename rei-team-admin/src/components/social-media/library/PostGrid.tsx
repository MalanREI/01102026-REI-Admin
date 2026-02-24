"use client";
import type { ContentPostWithRelations } from "@/src/lib/types/social-media";
import { PostCard } from "./PostCard";

export function PostGrid({
  posts,
  onPostClick,
}: {
  posts: ContentPostWithRelations[];
  onPostClick: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {posts.map((post) => (
        <PostCard key={post.id} post={post} onClick={() => onPostClick(post.id)} />
      ))}
    </div>
  );
}
