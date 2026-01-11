"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/src/lib/supabase/browser";
import { Button, Input } from "@/src/components/ui";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onLogin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const sb = supabaseBrowser();
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
      window.location.href = "/home";
    } catch (err: any) {
      setError(err?.message ?? "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl bg-white border shadow-sm p-6">
        <h1 className="text-xl font-semibold">Sign in</h1>
        <p className="text-sm text-gray-600 mt-1">
          This is an internal app. Accounts are created by an admin in Supabase Auth.
        </p>

        <form onSubmit={onLogin} className="mt-6 space-y-3">
          <div>
            <label className="text-xs text-gray-600">Email</label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
          </div>
          <div>
            <label className="text-xs text-gray-600">Password</label>
            <Input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required />
          </div>

          {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">{error}</div>}

          <Button type="submit" disabled={busy} className="w-full">
            {busy ? "Signing in..." : "Sign in"}
          </Button>

          <div className="text-xs text-gray-500">
            Tip: In Supabase dashboard → Authentication → Users → “Add user”.
          </div>
        </form>
      </div>
    </div>
  );
}
