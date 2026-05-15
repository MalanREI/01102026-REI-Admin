'use client';
import { useState, type FormEvent } from 'react';

/// <reference types="office-js" />

export default function AddinAuthPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `Sign-in failed (${res.status})`);
      }
      Office?.context?.ui?.messageParent?.(JSON.stringify({ status: 'signed-in' }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-sm p-6">
      <h1 className="text-lg font-semibold">Sign in to Alans Workspace</h1>
      <form onSubmit={onSubmit} className="mt-4 space-y-3 text-sm">
        <label className="block">
          <span className="text-xs uppercase text-gray-500">Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5"
            autoComplete="username"
          />
        </label>
        <label className="block">
          <span className="text-xs uppercase text-gray-500">Password</span>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5"
            autoComplete="current-password"
          />
        </label>
        {error && <p className="text-red-700">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded bg-blue-600 px-3 py-1.5 text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <p className="mt-4 text-xs text-gray-400">
        Office SSO bridging arrives in Phase 7.
      </p>
    </div>
  );
}
