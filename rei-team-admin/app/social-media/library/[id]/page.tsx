"use client";
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { PageShell } from "@/src/components/PageShell";
import { Button, Input, Textarea, Modal } from "@/src/components/ui";
import { StatusBadge } from "@/src/components/social-media/library/StatusBadge";
import type { ContentPostWithRelations, ContentType, BrandVoice, PostStatus } from "@/src/lib/types/social-media";

const PLATFORMS = [
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "tiktok", label: "TikTok" },
  { value: "youtube", label: "YouTube" },
  { value: "google_business", label: "Google Business" },
];

export default function PostDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [post, setPost] = useState<ContentPostWithRelations | null>(null);
  const [contentTypes, setContentTypes] = useState<ContentType[]>([]);
  const [brandVoices, setBrandVoices] = useState<BrandVoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [edited, setEdited] = useState(false);

  const [form, setForm] = useState({
    title: "",
    body: "",
    content_type_id: "",
    brand_voice_id: "",
    target_platforms: [] as string[],
    platform_specific_content: {} as Record<string, string>,
    media_urls: [] as string[],
  });

  const fetchPost = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/posts?id=${id}`);
      if (!res.ok) throw new Error(res.status === 404 ? "Post not found" : "Failed to fetch");
      const found: ContentPostWithRelations = await res.json();
      setPost(found);
      setForm({
        title: found.title ?? "",
        body: found.body,
        content_type_id: found.content_type_id ?? "",
        brand_voice_id: found.brand_voice_id ?? "",
        target_platforms: found.target_platforms ?? [],
        platform_specific_content: found.platform_specific_content ?? {},
        media_urls: found.media_urls ?? [],
      });
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchPost();
    Promise.all([
      fetch("/api/content-types").then((r) => r.json()),
      fetch("/api/brand-voices").then((r) => r.json()),
    ]).then(([ct, bv]) => {
      setContentTypes(ct);
      setBrandVoices(bv);
    });
  }, [fetchPost]);

  const setField = (k: string, v: unknown) => {
    setForm((f) => ({ ...f, [k]: v }));
    setEdited(true);
  };

  const togglePlatform = (p: string) => {
    setForm((f) => {
      const has = f.target_platforms.includes(p);
      return { ...f, target_platforms: has ? f.target_platforms.filter((x) => x !== p) : [...f.target_platforms, p] };
    });
    setEdited(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/posts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          ...form,
          title: form.title || null,
          content_type_id: form.content_type_id || null,
          brand_voice_id: form.brand_voice_id || null,
          media_urls: form.media_urls.filter(Boolean),
        }),
      });
      if (!res.ok) throw new Error("Save failed");
      setEdited(false);
      fetchPost();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (newStatus: PostStatus) => {
    setSaving(true);
    try {
      await fetch("/api/posts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: newStatus }),
      });
      fetchPost();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    await fetch(`/api/posts?id=${id}`, { method: "DELETE" });
    router.push("/social-media/library");
  };

  if (loading) return <PageShell><div className="animate-pulse h-96 rounded-xl bg-surface" /></PageShell>;
  if (error || !post) return <PageShell><div className="text-red-400 text-sm">{error || "Post not found"}</div></PageShell>;

  return (
    <PageShell>
      <div className="max-w-4xl space-y-5">
        <div className="flex items-center gap-3">
          <Link href="/social-media/library" className="text-slate-400 hover:text-slate-200 text-sm">← Library</Link>
          <span className="text-slate-600">/</span>
          <span className="text-sm text-slate-300">{post.title || "Post"}</span>
          <div className="ml-auto flex items-center gap-2">
            <StatusBadge status={post.status} />
            {edited && <Button onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save Changes"}</Button>}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {post.status === "draft" && (
            <Button variant="ghost" onClick={() => handleStatusChange("pending_approval")} disabled={saving}>
              Submit for Approval
            </Button>
          )}
          {post.status === "pending_approval" && (
            <>
              <Button onClick={() => handleStatusChange("approved")} disabled={saving}>Approve</Button>
              <Button variant="ghost" onClick={() => handleStatusChange("rejected")} disabled={saving} className="text-red-400 hover:text-red-300">Reject</Button>
            </>
          )}
          <Button variant="ghost" onClick={() => setDeleteOpen(true)} className="ml-auto text-red-400 hover:text-red-300 text-xs">
            Delete Post
          </Button>
        </div>

        <div className="grid grid-cols-3 gap-5">
          <div className="col-span-2 space-y-4">
            <div className="rounded-xl border border-white/[0.06] bg-surface p-4 space-y-4">
              <div className="space-y-1">
                <label className="text-xs text-slate-400">Title</label>
                <Input value={form.title} onChange={(e) => setField("title", e.target.value)} placeholder="Optional title…" />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-slate-400">Body *</label>
                <Textarea value={form.body} onChange={(e) => setField("body", e.target.value)} rows={8} placeholder="Post content…" />
              </div>
            </div>

            {form.target_platforms.length > 0 && (
              <div className="rounded-xl border border-white/[0.06] bg-surface p-4 space-y-3">
                <h3 className="text-sm font-medium text-slate-300">Platform-Specific Content</h3>
                {form.target_platforms.map((platform) => (
                  <div key={platform} className="space-y-1">
                    <label className="text-xs text-slate-400 capitalize">{platform.replace("_", " ")}</label>
                    <Textarea
                      value={form.platform_specific_content[platform] ?? ""}
                      onChange={(e) =>
                        setField("platform_specific_content", { ...form.platform_specific_content, [platform]: e.target.value })
                      }
                      rows={3}
                      placeholder={`Custom content for ${platform} (leave blank to use main body)`}
                    />
                  </div>
                ))}
              </div>
            )}

            <div className="rounded-xl border border-white/[0.06] bg-surface p-4 space-y-3">
              <h3 className="text-sm font-medium text-slate-300">Media URLs</h3>
              {form.media_urls.map((url, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input value={url} onChange={(e) => {
                    const arr = [...form.media_urls];
                    arr[i] = e.target.value;
                    setField("media_urls", arr);
                  }} placeholder="https://…" />
                  <Button variant="ghost" onClick={() => setField("media_urls", form.media_urls.filter((_, j) => j !== i))} className="shrink-0 px-2 py-1 text-xs">✕</Button>
                </div>
              ))}
              <Button variant="ghost" onClick={() => setField("media_urls", [...form.media_urls, ""])} className="text-xs px-2 py-1">+ Add URL</Button>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-xl border border-white/[0.06] bg-surface p-4 space-y-4">
              <div className="space-y-1">
                <label className="text-xs text-slate-400">Content Type</label>
                <select
                  value={form.content_type_id}
                  onChange={(e) => setField("content_type_id", e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-base px-3 py-2 text-sm text-slate-200"
                >
                  <option value="">None</option>
                  {contentTypes.map((ct) => (
                    <option key={ct.id} value={ct.id}>{ct.icon ? `${ct.icon} ` : ""}{ct.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-slate-400">Brand Voice</label>
                <select
                  value={form.brand_voice_id}
                  onChange={(e) => setField("brand_voice_id", e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-base px-3 py-2 text-sm text-slate-200"
                >
                  <option value="">None</option>
                  {brandVoices.map((bv) => (
                    <option key={bv.id} value={bv.id}>{bv.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs text-slate-400">Target Platforms</label>
                {PLATFORMS.map((p) => (
                  <label key={p.value} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.target_platforms.includes(p.value)}
                      onChange={() => togglePlatform(p.value)}
                      className="rounded"
                    />
                    <span className="text-xs text-slate-300">{p.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {(post.ai_model_used || post.ai_prompt_used) && (
              <div className="rounded-xl border border-white/[0.06] bg-surface p-4 space-y-2">
                <h3 className="text-xs font-medium text-slate-400">AI Generation Info</h3>
                {post.ai_model_used && <p className="text-xs text-slate-500">Model: {post.ai_model_used}</p>}
                {post.ai_prompt_used && <p className="text-xs text-slate-500 line-clamp-4">Prompt: {post.ai_prompt_used}</p>}
              </div>
            )}

            <div className="rounded-xl border border-white/[0.06] bg-surface p-4 space-y-2">
              <div className="text-xs text-slate-500">Created: {new Date(post.created_at).toLocaleString()}</div>
              <div className="text-xs text-slate-500">Updated: {new Date(post.updated_at).toLocaleString()}</div>
              {post.created_by_member && <div className="text-xs text-slate-500">By: {post.created_by_member.display_name}</div>}
            </div>
          </div>
        </div>
      </div>

      <Modal
        open={deleteOpen}
        title="Delete Post?"
        onClose={() => setDeleteOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button onClick={handleDelete} className="bg-red-600 hover:bg-red-500">Delete</Button>
          </>
        }
      >
        <p className="text-sm text-slate-300">Are you sure you want to permanently delete this post? This cannot be undone.</p>
      </Modal>
    </PageShell>
  );
}
