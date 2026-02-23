"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/src/lib/supabase/browser";
import { Button, Card, Input } from "@/src/components/ui";

export const dynamic = 'force-dynamic';

export default function ResetPasswordPage() {
  const sb = useMemo(() => supabaseBrowser(), []);

  const [ready, setReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Supabase recovery links typically arrive with tokens in the URL hash.
    // The supabase client will parse and set the session automatically.
    const check = async () => {
      const { data } = await sb.auth.getSession();
      setHasSession(!!data?.session);
      setReady(true);
    };
    void check();

    const { data: sub } = sb.auth.onAuthStateChange((_evt, session) => {
      setHasSession(!!session);
      setReady(true);
    });

    return () => {
      sub.subscription.unsubscribe();
    };
  }, [sb]);

  async function onUpdate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (password.length < 8) throw new Error("Password must be at least 8 characters.");
      if (password !== password2) throw new Error("Passwords do not match.");

      const { error } = await sb.auth.updateUser({ password });
      if (error) throw error;

      alert("Password updated. Please sign in.");
      window.location.href = "/login";
    } catch (err: unknown) {
      setError((err as Error)?.message ?? "Failed to update password");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-base flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-4">
        <h1 className="text-xl font-semibold text-slate-100">Reset password</h1>

        {!ready ? (
          <Card title="Loading">
            <div className="text-sm text-slate-400">Checking your reset link...</div>
          </Card>
        ) : !hasSession ? (
          <Card title="Reset link required">
            <div className="text-sm text-slate-400">
              Open this page using the password reset link emailed to you. If you don&apos;t have it, go back to the login
              page and click &quot;Forgot password&quot;.
            </div>
            <div className="mt-3">
              <Button onClick={() => (window.location.href = "/login")} className="w-full">
                Back to login
              </Button>
            </div>
          </Card>
        ) : (
          <Card title="Choose a new password">
            <form onSubmit={onUpdate} className="space-y-3">
              <div>
                <label className="text-xs text-slate-400">New password</label>
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              </div>
              <div>
                <label className="text-xs text-slate-400">Confirm new password</label>
                <Input type="password" value={password2} onChange={(e) => setPassword2(e.target.value)} required />
              </div>

              {error && (
                <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-2">{error}</div>
              )}

              <Button type="submit" disabled={busy} className="w-full">
                {busy ? "Updating..." : "Update password"}
              </Button>
            </form>
          </Card>
        )}
      </div>
    </div>
  );
}
