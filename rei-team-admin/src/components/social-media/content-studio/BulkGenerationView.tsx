"use client";

import { useState } from "react";
import { Button } from "@/src/components/ui";

type BulkPost = {
  id: string;
  content: string;
  approved: boolean;
  rejected: boolean;
};

type Props = {
  posts: BulkPost[];
  isLoading: boolean;
  saveStatus?: "idle" | "saving" | "saved" | "error";
  onSaveAll: (posts: BulkPost[]) => void;
  onUpdatePost: (id: string, content: string) => void;
  onToggleApproval: (id: string, approved: boolean) => void;
  onReject: (id: string) => void;
};

export function BulkGenerationView({
  posts,
  isLoading,
  saveStatus = "idle",
  onSaveAll,
  onUpdatePost,
  onToggleApproval,
  onReject,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const approvedPosts = posts.filter((p) => p.approved && !p.rejected);

  if (isLoading) {
    return (
      <div className="p-6 text-center space-y-3">
        <div className="flex justify-center gap-1">
          <span className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
          <span className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
          <span className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
        </div>
        <p className="text-sm text-slate-400">Generating posts…</p>
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="p-6 text-center text-slate-500 text-sm">
        No posts generated yet.
      </div>
    );
  }

  return (
    <div className="space-y-3 p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-400">{posts.length} posts generated • {approvedPosts.length} approved</span>
        <Button
          onClick={() => onSaveAll(approvedPosts)}
          disabled={approvedPosts.length === 0 || saveStatus === "saving"}
          className="text-xs py-1.5"
        >
          {saveStatus === "saving" ? "Saving…" : `Save ${approvedPosts.length} as Drafts`}
        </Button>
      </div>
      {saveStatus === "saved" && (
        <p className="text-xs text-emerald-400">✓ All approved posts saved as drafts.</p>
      )}
      {saveStatus === "error" && (
        <p className="text-xs text-red-400">Failed to save some posts. Please try again.</p>
      )}

      <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
        {posts.map((post, idx) => (
          <div
            key={post.id}
            className={`rounded-xl border p-3 space-y-2 transition-colors ${
              post.rejected
                ? "border-red-500/20 bg-red-500/5 opacity-50"
                : post.approved
                ? "border-emerald-500/30 bg-emerald-500/5"
                : "border-white/[0.06] bg-surface"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-slate-400">Post {idx + 1}</span>
              <div className="flex gap-1">
                {!post.rejected && (
                  <button
                    onClick={() => onToggleApproval(post.id, !post.approved)}
                    className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                      post.approved
                        ? "border-emerald-500/40 text-emerald-400 bg-emerald-500/10"
                        : "border-white/10 text-slate-400 hover:text-emerald-400 hover:border-emerald-500/30"
                    }`}
                  >
                    {post.approved ? "✓ Approved" : "Approve"}
                  </button>
                )}
                {!post.rejected && (
                  <button
                    onClick={() => { setEditingId(post.id); setEditValue(post.content); }}
                    className="text-xs px-2 py-0.5 rounded-full border border-white/10 text-slate-400 hover:text-slate-200"
                  >
                    Edit
                  </button>
                )}
                <button
                  onClick={() => onReject(post.id)}
                  className="text-xs px-2 py-0.5 rounded-full border border-white/10 text-slate-500 hover:text-red-400 hover:border-red-500/30"
                >
                  {post.rejected ? "↩ Restore" : "✕"}
                </button>
              </div>
            </div>

            {editingId === post.id ? (
              <div className="space-y-2">
                <textarea
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  rows={4}
                  className="w-full rounded-lg border border-white/10 bg-base px-3 py-2 text-xs text-slate-200 outline-none focus:ring-2 focus:ring-emerald-500/40 resize-none"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => { onUpdatePost(post.id, editValue); setEditingId(null); }}
                    className="text-xs px-2 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-500"
                  >Save</button>
                  <button
                    onClick={() => setEditingId(null)}
                    className="text-xs px-2 py-1 rounded text-slate-400 hover:text-slate-200"
                  >Cancel</button>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-300 whitespace-pre-wrap leading-relaxed">{post.content}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
