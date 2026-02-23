"use client";

import { useMemo, useState } from "react";
import { supabaseBrowser } from "@/src/lib/supabase/browser";
import { Button, Input, Tabs } from "@/src/components/ui";
import { APP_NAME } from "@/src/config/app.config";

export const dynamic = 'force-dynamic';

export default function LoginPage() {
  const sb = useMemo(() => supabaseBrowser(), []);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">("signin");

  async function onLogin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
      window.location.href = "/home";
    } catch (err: unknown) {
      setError((err as Error)?.message ?? "Login failed");
    } finally {
      setBusy(false);
    }
  }

  async function onSignup(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, full_name: fullName }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Signup failed");
      alert("Account created. You can now sign in.");
      setMode("signin");
    } catch (err: unknown) {
      setError((err as Error)?.message ?? "Signup failed");
    } finally {
      setBusy(false);
    }
  }

  async function onForgot(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const redirectTo = `${window.location.origin}/reset-password`;
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) throw error;
      alert("Password reset email sent (if the account exists). Check your inbox.");
      setMode("signin");
    } catch (err: unknown) {
      setError((err as Error)?.message ?? "Failed to send reset email");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-base flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl bg-surface border border-white/[0.06] shadow-2xl p-6">
        <h1 className="text-xl font-semibold text-slate-100">{APP_NAME}</h1>
        <p className="text-sm text-slate-400 mt-1">Sign in, create an account, or reset your password.</p>

        <div className="mt-4">
          <Tabs
            tabs={[
              { value: "signin", label: "Sign in" },
              { value: "signup", label: "Create account" },
              { value: "forgot", label: "Forgot password" },
            ]}
            value={mode}
            onChange={(v) => setMode(v as "signin" | "signup" | "forgot")}
          />
        </div>

        <form onSubmit={mode === "signin" ? onLogin : mode === "signup" ? onSignup : onForgot} className="mt-6 space-y-3">
          {mode === "signup" && (
            <div>
              <label className="text-xs text-slate-400">Full name</label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required placeholder="Alan Moore" />
            </div>
          )}
          <div>
            <label className="text-xs text-slate-400">Email</label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
          </div>
          {mode !== "forgot" && (
            <div>
              <label className="text-xs text-slate-400">Password</label>
              <Input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required />
            </div>
          )}

          {error && <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-2">{error}</div>}

          <Button type="submit" disabled={busy} className="w-full">
            {busy
              ? "Working..."
              : mode === "signin"
                ? "Sign in"
                : mode === "signup"
                  ? "Create account"
                  : "Send reset email"}
          </Button>

          <div className="text-xs text-slate-500">
            Admin tip: You can still create users in Supabase → Authentication → Users.
          </div>
        </form>
      </div>
    </div>
  );
}
