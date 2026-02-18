"use client";

import { useMemo, useState } from "react";
import { supabaseBrowser } from "@/src/lib/supabase/browser";
import { Button, Input, Tabs } from "@/src/components/ui";

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
      const { error } = await sb.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName },
        },
      });
      if (error) throw error;
      // Depending on Supabase email confirmation settings, user may need to confirm.
      alert("Account created. If email confirmation is enabled, check your inbox.");
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
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl bg-white border shadow-sm p-6">
        <h1 className="text-xl font-semibold">REI Team Admin</h1>
        <p className="text-sm text-gray-600 mt-1">Sign in, create an account, or reset your password.</p>

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
              <label className="text-xs text-gray-600">Full name</label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required placeholder="Alan Moore" />
            </div>
          )}
          <div>
            <label className="text-xs text-gray-600">Email</label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
          </div>
          {mode !== "forgot" && (
            <div>
              <label className="text-xs text-gray-600">Password</label>
              <Input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required />
            </div>
          )}

          {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">{error}</div>}

          <Button type="submit" disabled={busy} className="w-full">
            {busy
              ? "Working..."
              : mode === "signin"
                ? "Sign in"
                : mode === "signup"
                  ? "Create account"
                  : "Send reset email"}
          </Button>

          <div className="text-xs text-gray-500">
            Admin tip: You can still create users in Supabase → Authentication → Users.
          </div>
        </form>
      </div>
    </div>
  );
}
