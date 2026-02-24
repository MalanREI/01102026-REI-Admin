"use client";
import { useCallback, useEffect, useState } from "react";
import { PageShell } from "@/src/components/PageShell";
import { Button, Modal } from "@/src/components/ui";
import { BrandVoiceCard } from "@/src/components/social-media/settings/BrandVoiceCard";
import { BrandVoiceForm } from "@/src/components/social-media/settings/BrandVoiceForm";
import type { BrandVoice } from "@/src/lib/types/social-media";
import Link from "next/link";

export default function BrandVoicesPage() {
  const [voices, setVoices] = useState<BrandVoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<BrandVoice | null>(null);
  const [testOpen, setTestOpen] = useState(false);
  const [testVoice, setTestVoice] = useState<BrandVoice | null>(null);
  const [testResult, setTestResult] = useState("");
  const [testLoading, setTestLoading] = useState(false);
  const [postCounts, setPostCounts] = useState<Record<string, number>>({});
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/brand-voices");
      const data: BrandVoice[] = res.ok ? await res.json() : [];
      setVoices(data);

      const postsRes = await fetch("/api/posts?sort_by=created_at&sort_dir=desc");
      if (postsRes.ok) {
        const posts = await postsRes.json();
        const counts: Record<string, number> = {};
        posts.forEach((p: { brand_voice_id?: string }) => {
          if (p.brand_voice_id) counts[p.brand_voice_id] = (counts[p.brand_voice_id] ?? 0) + 1;
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

  const handleSave = async (data: Partial<BrandVoice>) => {
    if (editing) {
      await fetch("/api/brand-voices", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editing.id, ...data }),
      });
    } else {
      await fetch("/api/brand-voices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
    }
    setFormOpen(false);
    setEditing(null);
    fetchData();
  };

  const handleDelete = async (id: string) => {
    setDeleteId(id);
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    await fetch(`/api/brand-voices?id=${deleteId}`, { method: "DELETE" });
    setDeleteId(null);
    fetchData();
  };

  const handleTest = async (voice: BrandVoice) => {
    setTestVoice(voice);
    setTestResult("");
    setTestOpen(true);
    setTestLoading(true);
    try {
      const res = await fetch("/api/brand-voices/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ systemPrompt: voice.system_prompt, name: voice.name }),
      });
      const json = await res.json();
      setTestResult(json.result ?? json.error ?? "No result");
    } catch (e) {
      setTestResult(String(e));
    } finally {
      setTestLoading(false);
    }
  };

  return (
    <PageShell>
      <div className="max-w-4xl space-y-5">
        <div className="flex items-center gap-3">
          <Link href="/social-media/settings" className="text-slate-400 hover:text-slate-200 text-sm">← Settings</Link>
          <span className="text-slate-600">/</span>
          <div className="flex-1">
            <h1 className="text-2xl font-semibold text-slate-100">Brand Voices</h1>
            <p className="text-sm text-slate-400 mt-0.5">Create and manage AI brand voice personalities.</p>
          </div>
          <Button onClick={() => { setEditing(null); setFormOpen(true); }}>+ New Voice</Button>
        </div>

        {loading && <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-40 rounded-xl bg-surface animate-pulse" />)}</div>}
        {error && <div className="text-red-400 text-sm">{error}</div>}

        {!loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {voices.map((v) => (
              <BrandVoiceCard
                key={v.id}
                voice={v}
                postCount={postCounts[v.id] ?? 0}
                onEdit={() => { setEditing(v); setFormOpen(true); }}
                onDelete={() => handleDelete(v.id)}
                onTest={() => handleTest(v)}
              />
            ))}
          </div>
        )}

        {!loading && voices.length === 0 && (
          <div className="rounded-xl border border-white/[0.06] bg-surface px-4 py-10 text-center text-sm text-slate-400">
            No brand voices yet. Create your first one.
          </div>
        )}

        <Modal
          open={formOpen}
          title={editing ? "Edit Brand Voice" : "New Brand Voice"}
          onClose={() => { setFormOpen(false); setEditing(null); }}
          maxWidthClass="max-w-2xl"
        >
          <BrandVoiceForm
            initial={editing ?? undefined}
            onSave={handleSave}
            onCancel={() => { setFormOpen(false); setEditing(null); }}
          />
        </Modal>

        <Modal
          open={testOpen}
          title={`Testing: ${testVoice?.name ?? ""}`}
          onClose={() => setTestOpen(false)}
        >
          {testLoading ? (
            <div className="space-y-3 animate-pulse">
              <div className="h-4 bg-elevated rounded w-3/4" />
              <div className="h-4 bg-elevated rounded w-full" />
              <div className="h-4 bg-elevated rounded w-5/6" />
            </div>
          ) : (
            <div className="rounded-lg bg-elevated border border-white/[0.06] px-4 py-3">
              <p className="text-sm text-slate-200 whitespace-pre-wrap">{testResult}</p>
            </div>
          )}
        </Modal>

        <Modal
          open={deleteId !== null}
          title="Delete Brand Voice"
          onClose={() => setDeleteId(null)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setDeleteId(null)}>Cancel</Button>
              <Button onClick={confirmDelete} className="bg-red-600 hover:bg-red-500">Delete</Button>
            </>
          }
        >
          <p className="text-sm text-slate-300">Are you sure you want to delete this brand voice? This action cannot be undone.</p>
        </Modal>
      </div>
    </PageShell>
  );
}
