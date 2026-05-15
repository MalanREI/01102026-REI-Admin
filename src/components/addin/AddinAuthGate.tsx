'use client';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { openSignInDialog } from '@/src/lib/office/dialog-auth';

type AuthState =
  | { status: 'checking' }
  | { status: 'signed-in'; email: string }
  | { status: 'signed-out' }
  | { status: 'error'; message: string };

export default function AddinAuthGate({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthState>({ status: 'checking' });

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me', {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!res.ok) {
        setAuth({ status: 'signed-out' });
        return;
      }
      const data = await res.json();
      if (data?.email || data?.user?.email) {
        setAuth({ status: 'signed-in', email: data.email ?? data.user?.email });
      } else {
        setAuth({ status: 'signed-out' });
      }
    } catch (err) {
      setAuth({
        status: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleSignIn = useCallback(async () => {
    const result = await openSignInDialog();
    if (result.ok) {
      await refresh();
    }
  }, [refresh]);

  if (auth.status === 'checking') {
    return <div className="p-4 text-sm text-gray-500">Checking sign-in…</div>;
  }

  if (auth.status === 'error') {
    return (
      <div className="p-4 text-sm">
        <p className="text-red-700">Auth check failed: {auth.message}</p>
        <button
          onClick={() => void refresh()}
          className="mt-2 rounded bg-gray-100 px-3 py-1 text-sm hover:bg-gray-200"
        >
          Retry
        </button>
      </div>
    );
  }

  if (auth.status === 'signed-out') {
    return (
      <div className="p-4 text-sm">
        <h2 className="font-semibold">Alans Workspace</h2>
        <p className="mt-2 text-gray-600">Sign in to continue.</p>
        <button
          onClick={() => void handleSignIn()}
          className="mt-3 rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
        >
          Sign in
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-gray-200 px-4 py-2 text-xs text-gray-500">
        Signed in as {auth.email}
      </header>
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
