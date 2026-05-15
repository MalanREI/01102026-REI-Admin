'use client';
import { useState, useEffect } from 'react';
import { listUserProjects, createProject } from '@/src/lib/supabase/workspace-queries';

const PROJECT_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316'];

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export default function SetupPage() {
  const [projects, setProjects] = useState<Awaited<ReturnType<typeof listUserProjects>>>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try { setProjects(await listUserProjects()); }
    catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  async function addProject() {
    if (!newName.trim()) return;
    setSaving(true); setError(null);
    try {
      await createProject({
        name: newName.trim(), slug: slugify(newName.trim()),
        description: newDesc.trim() || undefined,
        color: PROJECT_COLORS[projects.length % PROJECT_COLORS.length],
      });
      setNewName(''); setNewDesc('');
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setSaving(false); }
  }

  return (
    <div className="p-4 text-sm max-w-md">
      <h1 className="text-base font-semibold">Projects</h1>
      <p className="mt-1 text-xs text-gray-500">Define your projects so AI can classify incoming emails.</p>

      {loading ? <p className="mt-4 text-gray-500">Loading…</p> : (
        <>
          {projects.length > 0 && (
            <ul className="mt-4 space-y-2">
              {projects.map((p) => (
                <li key={p.id} className="flex items-start gap-2 rounded border border-gray-200 p-2">
                  <span className="mt-1 inline-block w-3 h-3 rounded-full flex-shrink-0" style={{ background: p.color ?? '#888' }} />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900">{p.name}</div>
                    {p.description && <div className="text-xs text-gray-600 mt-0.5">{p.description}</div>}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <section className="mt-4 border-t border-gray-200 pt-4">
            <h2 className="text-xs uppercase text-gray-500">Add project</h2>
            <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)}
              placeholder="Project name (e.g. NVIDIA Argo)" className="mt-2 w-full rounded border border-gray-300 px-2 py-1.5 text-sm" />
            <textarea value={newDesc} onChange={(e) => setNewDesc(e.target.value)}
              placeholder="Short description — what emails belong here? (optional)" rows={3}
              className="mt-2 w-full rounded border border-gray-300 px-2 py-1.5 text-sm" />
            <button onClick={() => void addProject()} disabled={saving || !newName.trim()}
              className="mt-2 rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Saving…' : 'Add project'}
            </button>
          </section>
          {error && <p className="mt-3 text-xs text-red-700">{error}</p>}
        </>
      )}
    </div>
  );
}
