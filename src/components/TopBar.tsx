"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/src/lib/supabase/browser";
import { Button, Modal, Input } from "@/src/components/ui";

export function TopBar({ onToggleSidebar }: { onToggleSidebar: () => void }) {
  const sb = useMemo(() => supabaseBrowser(), []);
  const [email, setEmail] = useState<string>("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [pwdOpen, setPwdOpen] = useState(false);

  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const { data } = await sb.auth.getUser();
      setEmail(data?.user?.email ?? "");
    };
    void load();
  }, [sb]);

  async function signOut() {
    await sb.auth.signOut();
    window.location.href = "/login";
  }

  async function updatePassword() {
    setBusy(true);
    setErr(null);
    try {
      if (p1.length < 8) throw new Error("Password must be at least 8 characters.");
      if (p1 !== p2) throw new Error("Passwords do not match.");
      const { error } = await sb.auth.updateUser({ password: p1 });
      if (error) throw error;
      setPwdOpen(false);
      setP1("");
      setP2("");
      alert("Password updated.");
    } catch (e: any) {
      setErr(e?.message ?? "Failed to update password");
    } finally {
      setBusy(false);
    }
  }

  return (
    <header className="sticky top-0 z-40 border-b bg-white">
      <div className="h-14 px-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={onToggleSidebar} aria-label="Toggle sidebar">
            ☰
          </Button>
          <div className="text-sm text-gray-600">REI Ops</div>
        </div>

        <div className="relative">
          <button
            className="h-9 w-9 rounded-full border bg-gray-50 text-sm font-semibold"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Open profile menu"
          >
            {(email?.[0] ?? "U").toUpperCase()}
          </button>

          {menuOpen && (
            <div className="absolute right-0 mt-2 w-56 rounded-xl border bg-white shadow-lg p-2">
              <div className="px-2 py-1.5">
                <div className="text-xs text-gray-500">Signed in as</div>
                <div className="text-sm font-medium truncate">{email || ""}</div>
              </div>
              <div className="my-2 border-t" />
              <button
                className="w-full text-left rounded-lg px-2 py-2 text-sm hover:bg-gray-50"
                onClick={() => {
                  setMenuOpen(false);
                  setPwdOpen(true);
                }}
              >
                Update password
              </button>
              <button className="w-full text-left rounded-lg px-2 py-2 text-sm hover:bg-gray-50" onClick={signOut}>
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>

      <Modal
        open={pwdOpen}
        title="Update password"
        onClose={() => {
          setPwdOpen(false);
          setErr(null);
        }}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPwdOpen(false)}>
              Cancel
            </Button>
            <Button onClick={updatePassword} disabled={busy}>
              {busy ? "Saving..." : "Save"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-600">New password</label>
            <Input type="password" value={p1} onChange={(e) => setP1(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-gray-600">Confirm new password</label>
            <Input type="password" value={p2} onChange={(e) => setP2(e.target.value)} />
          </div>
          {err && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">{err}</div>}
        </div>
      </Modal>
    </header>
  );
}
