'use client';
import { useCallback, useEffect, useState } from 'react';
import { readOfficeDiagnostics, type OfficeDiagnostics } from '@/src/lib/office/diagnostics';
import { waitForOffice } from '@/src/lib/office/office-ready';

type SettingsState = {
  anthropicApiKeyLastFour: string | null;
  loading: boolean;
  saving: boolean;
  error: string | null;
  newKey: string;
};

export default function SettingsPage() {
  const [s, setS] = useState<SettingsState>({
    anthropicApiKeyLastFour: null,
    loading: true,
    saving: false,
    error: null,
    newKey: '',
  });

  const [diag, setDiag] = useState<OfficeDiagnostics | null>(null);

  useEffect(() => {
    waitForOffice()
      .then(() => setDiag(readOfficeDiagnostics()))
      .catch(() => setDiag(null));
  }, []);

  const refresh = useCallback(async () => {
    setS((p) => ({ ...p, loading: true, error: null }));
    try {
      const res = await fetch('/api/user-settings', { credentials: 'include', cache: 'no-store' });
      if (!res.ok) throw new Error(`Load failed (${res.status})`);
      const data = await res.json();
      setS((p) => ({
        ...p,
        loading: false,
        anthropicApiKeyLastFour: data.anthropicApiKeyLastFour,
      }));
    } catch (err) {
      setS((p) => ({ ...p, loading: false, error: err instanceof Error ? err.message : String(err) }));
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const save = async () => {
    if (!s.newKey) return;
    setS((p) => ({ ...p, saving: true, error: null }));
    try {
      const res = await fetch('/api/user-settings', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ anthropicApiKey: s.newKey }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `Save failed (${res.status})`);
      }
      setS((p) => ({ ...p, saving: false, newKey: '' }));
      await refresh();
    } catch (err) {
      setS((p) => ({ ...p, saving: false, error: err instanceof Error ? err.message : String(err) }));
    }
  };

  const clear = async () => {
    setS((p) => ({ ...p, saving: true, error: null }));
    try {
      const res = await fetch('/api/user-settings', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ anthropicApiKey: null }),
      });
      if (!res.ok) throw new Error(`Clear failed (${res.status})`);
      await refresh();
    } catch (err) {
      setS((p) => ({ ...p, saving: false, error: err instanceof Error ? err.message : String(err) }));
    } finally {
      setS((p) => ({ ...p, saving: false }));
    }
  };

  return (
    <div className="p-4 text-sm">
      <h1 className="text-base font-semibold">Settings</h1>
      <section className="mt-4">
        <h2 className="text-xs uppercase text-gray-500">Anthropic API key</h2>
        {s.loading ? (
          <p className="mt-2 text-gray-500">Loading…</p>
        ) : (
          <>
            <p className="mt-2 text-gray-700">
              {s.anthropicApiKeyLastFour
                ? `Saved key ends in …${s.anthropicApiKeyLastFour}`
                : 'No key saved.'}
            </p>
            <label className="mt-3 block">
              <span className="text-xs uppercase text-gray-500">New key</span>
              <input
                type="password"
                value={s.newKey}
                onChange={(e) => setS((p) => ({ ...p, newKey: e.target.value }))}
                placeholder="sk-ant-…"
                className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5"
              />
            </label>
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => void save()}
                disabled={s.saving || !s.newKey}
                className="rounded bg-blue-600 px-3 py-1 text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {s.saving ? 'Saving…' : 'Save key'}
              </button>
              {s.anthropicApiKeyLastFour && (
                <button
                  onClick={() => void clear()}
                  disabled={s.saving}
                  className="rounded bg-gray-100 px-3 py-1 hover:bg-gray-200 disabled:opacity-50"
                >
                  Clear
                </button>
              )}
            </div>
            {s.error && <p className="mt-2 text-red-700">{s.error}</p>}
            <p className="mt-3 text-xs text-gray-400">
              Key is encrypted at rest with AES-256-GCM. It's only used by AI features
              (Phase 8+); saving it here now has no effect yet.
            </p>
          </>
        )}
      </section>

      <section className="mt-6 border-t border-gray-200 pt-4">
        <h2 className="text-xs uppercase text-gray-500">Diagnostics</h2>
        {!diag ? (
          <p className="mt-2 text-gray-500">Reading Office.js capabilities…</p>
        ) : (
          <dl className="mt-2 space-y-1 text-xs">
            <div>
              <dt className="text-gray-500">Host</dt>
              <dd>{diag.hostName} · {diag.platform} · v{diag.hostVersion}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Outlook account</dt>
              <dd>{diag.userEmail ?? <em>(not detected)</em>}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Mailbox API requirement sets</dt>
              <dd className="font-mono">
                1.5: {diag.supportsMailbox15 ? '✓' : '✗'} · 1.6: {diag.supportsMailbox16 ? '✓' : '✗'} · 1.7: {diag.supportsMailbox17 ? '✓' : '✗ (no pinning)'} · 1.8: {diag.supportsMailbox18 ? '✓' : '✗'} · 1.9: {diag.supportsMailbox19 ? '✓' : '✗'}
              </dd>
            </div>
            <p className="pt-2 text-gray-400">
              Pinning requires Mailbox 1.7. If 1.7 shows ✗, this Outlook client doesn't support pinning.
            </p>
          </dl>
        )}
      </section>
    </div>
  );
}
