"use client";
import { useCallback, useEffect, useState } from "react";
import { PageShell } from "@/src/components/PageShell";
import { Button, Modal } from "@/src/components/ui";
import { ContentTypeCard } from "@/src/components/social-media/settings/ContentTypeCard";
import { ContentTypeForm } from "@/src/components/social-media/settings/ContentTypeForm";
import type { ContentType, BrandVoice } from "@/src/lib/types/social-media";
import Link from "next/link";

export default function ContentTypesPage() {
  const [contentTypes, setContentTypes] = useState<ContentType[]>([]);
  const [brandVoices, setBrandVoices] = useState<BrandVoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ContentType | null>(null);
  const [postCounts, setPostCounts] = useState<Record<string, number>>({});

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [ctRes, bvRes] = await Promise.all([
        fetch("/api/content-types?activeOnly=false"),
        fetch("/api/brand-voices"),
      ]);
      const ct: ContentType[] = ctRes.ok ? await ctRes.json() : [];
      const bv: BrandVoice[] = bvRes.ok ? await bvRes.json() : [];
      setContentTypes(ct);
      setBrandVoices(bv);

      const postsRes = await fetch("/api/posts?sort_by=created_at&sort_dir=desc");
      if (postsRes.ok) {
        const posts = await postsRes.json();
        const counts: Record<string, number> = {};
        posts.forEach((p: { content_type_id?: string }) => {
          if (p.content_type_id) counts[p.content_type_id] = (counts[p.content_type_id] ?? 0) + 1;
        });
        setPostCounts(counts);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSave = async (data: Partial<ContentType>) => {
    if (editing) {
      await fetch("/api/content-types", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editing.id, ...data }),
      });
    } else {
      await fetch("/api/content-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, is_system: false }),
      });
    }
    setFormOpen(false);
    setEditing(null);
    fetchData();
  };

  const handleToggleActive = async (ct: ContentType) => {
    await fetch("/api/content-types", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: ct.id, is_active: !ct.is_active }),
    });
    fetchData();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this content type?")) return;
    await fetch(`/api/content-types?id=${id}`, { method: "DELETE" });
    fetchData();
  };

  return (
    <PageShell>
      <div className="max-w-4xl space-y-5">
        <div className="flex items-center gap-3">
          <Link href="/social-media/settings" className="text-slate-400 hover:text-slate-200 text-sm">← Settings</Link>
          <span className="text-slate-600">/</span>
          <div className="flex-1">
            <h1 className="text-2xl font-semibold text-slate-100">Content Types</h1>
            <p className="text-sm text-slate-400 mt-0.5">Manage post content types and their default settings.</p>
          </div>
          <Button onClick={() => { setEditing(null); setFormOpen(true); }}>+ New Type</Button>
        </div>

        {loading && <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-36 rounded-xl bg-surface animate-pulse" />)}</div>}
        {error && <div className="text-red-400 text-sm">{error}</div>}

        {!loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {contentTypes.map((ct) => (
              <ContentTypeCard
                key={ct.id}
                contentType={ct}
                postCount={postCounts[ct.id] ?? 0}
                onEdit={() => { setEditing(ct); setFormOpen(true); }}
                onToggleActive={() => handleToggleActive(ct)}
                onDelete={() => handleDelete(ct.id)}
              />
            ))}
          </div>
        )}

        {!loading && contentTypes.length === 0 && (
          <div className="rounded-xl border border-white/[0.06] bg-surface px-4 py-10 text-center text-sm text-slate-400">
            No content types yet. Create your first one.
          </div>
        )}

        <Modal
          open={formOpen}
          title={editing ? "Edit Content Type" : "New Content Type"}
          onClose={() => { setFormOpen(false); setEditing(null); }}
        >
          <ContentTypeForm
            initial={editing ?? undefined}
            brandVoices={brandVoices}
            onSave={handleSave}
            onCancel={() => { setFormOpen(false); setEditing(null); }}
          />
        </Modal>
      </div>
    </PageShell>
  );
}
