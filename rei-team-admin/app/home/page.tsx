"use client";

import { useEffect, useMemo, useState } from "react";
import { PageShell } from "@/src/components/PageShell";
import { Button, Card, Input, Textarea } from "@/src/components/ui";
import { supabaseBrowser } from "@/src/lib/supabase/browser";

type LinkRow = {
  id: string;
  title: string;
  url: string;
  purpose: string | null;
  created_at: string;
};

export default function HomePage() {
  const sb = useMemo(() => supabaseBrowser(), []);
  const [items, setItems] = useState<LinkRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [purpose, setPurpose] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    const { data, error } = await sb.from("links").select("*").order("created_at", { ascending: false });
    if (error) setError(error.message);
    setItems((data as any) ?? []);
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  async function addLink() {
    setSaving(true);
    setError(null);
    try {
      const { error } = await sb.from("links").insert([{ title, url, purpose: purpose || null }]);
      if (error) throw error;
      setTitle(""); setUrl(""); setPurpose("");
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this link?")) return;
    const { error } = await sb.from("links").delete().eq("id", id);
    if (error) setError(error.message);
    await load();
  }

  return (
    <PageShell>
      <div className="max-w-5xl space-y-6">
        <h1 className="text-2xl font-semibold">Home</h1>

        <Card title="Add a Link">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-600">Title</label>
              <Input value={title} onChange={(e)=>setTitle(e.target.value)} placeholder="e.g., Team Drive Folder" />
            </div>
            <div>
              <label className="text-xs text-gray-600">Link</label>
              <Input value={url} onChange={(e)=>setUrl(e.target.value)} placeholder="https://..." />
            </div>
            <div className="md:col-span-2">
              <label className="text-xs text-gray-600">Purpose</label>
              <Textarea value={purpose} onChange={(e)=>setPurpose(e.target.value)} rows={3} placeholder="Why this link matters..." />
            </div>
            <div className="md:col-span-2">
              <Button onClick={addLink} disabled={saving || !title || !url}>
                {saving ? "Saving..." : "Add Link"}
              </Button>
            </div>
          </div>
          {error && <div className="mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">{error}</div>}
        </Card>

        <Card title="Links">
          {loading ? (
            <div className="text-sm text-gray-600">Loading...</div>
          ) : items.length === 0 ? (
            <div className="text-sm text-gray-600">No links yet.</div>
          ) : (
            <ul className="divide-y">
              {items.map((l) => (
                <li key={l.id} className="py-3 flex items-start justify-between gap-4">
                  <div>
                    <a href={l.url} target="_blank" className="font-medium hover:underline">
                      {l.title}
                    </a>
                    {l.purpose && <div className="text-sm text-gray-600 mt-1">{l.purpose}</div>}
                    <div className="text-xs text-gray-400 mt-1">{new Date(l.created_at).toLocaleString()}</div>
                  </div>
                  <Button variant="ghost" onClick={()=>remove(l.id)}>Delete</Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </PageShell>
  );
}
