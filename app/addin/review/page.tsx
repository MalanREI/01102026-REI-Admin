'use client';
import { useState, useEffect } from 'react';
import { listReviewQueue, reviewProjectAssignment, listUserProjects } from '@/src/lib/supabase/workspace-queries';

export default function ReviewPage() {
  const [items, setItems] = useState<Awaited<ReturnType<typeof listReviewQueue>>>([]);
  const [projects, setProjects] = useState<Awaited<ReturnType<typeof listUserProjects>>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true); setError(null);
    try {
      const [q, p] = await Promise.all([listReviewQueue(), listUserProjects()]);
      setItems(q); setProjects(p);
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  async function decide(emailId: string, projectId: string | null) {
    try { await reviewProjectAssignment(emailId, projectId); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : String(err)); }
  }

  return (
    <div className="p-4 text-sm max-w-md">
      <h1 className="text-base font-semibold">Review queue</h1>
      <p className="mt-1 text-xs text-gray-500">Emails AI classified with low confidence. Confirm or override.</p>

      {loading ? <p className="mt-4 text-gray-500">Loading…</p> : items.length === 0 ? (
        <p className="mt-4 text-gray-500">Nothing to review.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {items.map((item) => {
            const email = item.emails as { subject?: string; from_name?: string; from_address?: string; received_at?: string } | null;
            const project = item.projects as { name?: string; color?: string } | null;
            return (
              <li key={item.email_id} className="rounded border border-gray-200 p-2 space-y-1">
                <div className="font-medium text-gray-900 truncate text-xs">{email?.subject ?? '(no subject)'}</div>
                <div className="text-xs text-gray-500">
                  {email?.from_name ?? email?.from_address} · {email?.received_at && new Date(email.received_at).toLocaleDateString()}
                </div>
                <div className="text-xs">
                  AI guess: <span style={{ color: project?.color ?? '#888' }}>{project?.name ?? 'Unknown'}</span>
                  {' '}({Math.round(item.confidence_score * 100)}%)
                </div>
                <div className="flex gap-1 flex-wrap pt-1">
                  <button onClick={() => void decide(item.email_id, item.project_id)}
                    className="rounded bg-green-600 px-2 py-0.5 text-xs text-white hover:bg-green-700">Confirm</button>
                  {projects.filter((p) => p.id !== item.project_id).map((p) => (
                    <button key={p.id} onClick={() => void decide(item.email_id, p.id)}
                      className="rounded border border-gray-300 px-2 py-0.5 text-xs hover:bg-gray-100">→ {p.name}</button>
                  ))}
                  <button onClick={() => void decide(item.email_id, null)}
                    className="rounded border border-gray-300 px-2 py-0.5 text-xs hover:bg-gray-100">None</button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {error && <p className="mt-3 text-xs text-red-700">{error}</p>}
    </div>
  );
}
