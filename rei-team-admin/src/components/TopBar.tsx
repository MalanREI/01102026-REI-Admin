"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/src/lib/supabase/browser";
import { Button, Modal, Input } from "@/src/components/ui";
import { useRecording } from "@/src/context/RecordingContext";

const MAX_UNREAD_NOTIFICATIONS = 99;

export function TopBar({ onToggleSidebar }: { onToggleSidebar: () => void }) {
  const sb = useMemo(() => supabaseBrowser(), []);
  const [email, setEmail] = useState<string>("");
  const [memberId, setMemberId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pwdOpen, setPwdOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const { isRecording, recSeconds, activeMeetingId, activeMeetingTitle } = useRecording();

  useEffect(() => {
    const load = async () => {
      const { data } = await sb.auth.getUser();
      setEmail(data?.user?.email ?? "");
    };
    void load();
  }, [sb]);

  // Fetch current team member id
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.ok ? r.json() : null)
      .then((m) => { if (m?.id) setMemberId(m.id); })
      .catch(() => {});
  }, []);

  const fetchUnread = useCallback(() => {
    if (!memberId) return;
    fetch(`/api/notifications?recipient_id=${memberId}&unread=true&limit=${MAX_UNREAD_NOTIFICATIONS}`)
      .then((r) => r.ok ? r.json() : [])
      .then((data: unknown[]) => setUnreadCount(Array.isArray(data) ? data.length : 0))
      .catch(() => {});
  }, [memberId]);

  useEffect(() => {
    fetchUnread();
    const interval = setInterval(fetchUnread, 30_000);
    return () => clearInterval(interval);
  }, [fetchUnread]);

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
    } catch (e: unknown) {
      setErr((e as Error)?.message ?? "Failed to update password");
    } finally {
      setBusy(false);
    }
  }

  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-surface">
      <div className="h-14 px-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={onToggleSidebar} aria-label="Toggle sidebar">
            ☰
          </Button>
          <div className="text-sm text-slate-400">REI Ops</div>
        </div>

        {/* Global recording indicator */}
        {isRecording && activeMeetingId && (
          <Link
            href={`/meetings/${activeMeetingId}`}
            className="flex items-center gap-1.5 rounded-full bg-red-500/10 border border-red-500/20 px-3 py-1 text-xs font-medium text-red-400 hover:bg-red-500/20"
          >
            <span className="inline-block h-2 w-2 rounded-full bg-red-500 animate-pulse" />
            {activeMeetingTitle ?? "Recording"}
            &nbsp;·&nbsp;
            {Math.floor(recSeconds / 60)}m {recSeconds % 60}s
          </Link>
        )}

        <div className="flex items-center gap-2">
          {/* Notification bell */}
          <Link
            href="/social-media/library?status=pending_approval"
            className="relative p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-white/[0.06] transition-colors"
            aria-label="Pending approvals"
            title="Pending approvals"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 10-12 0v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </Link>

          <div className="relative">
            <button
              className="h-9 w-9 rounded-full border border-white/10 bg-elevated text-sm font-semibold text-slate-300"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="Open profile menu"
            >
              {(email?.[0] ?? "U").toUpperCase()}
            </button>

          {menuOpen && (
            <div className="absolute right-0 mt-2 w-56 rounded-xl border border-white/10 bg-surface shadow-2xl p-2">
              <div className="px-2 py-1.5">
                <div className="text-xs text-slate-500">Signed in as</div>
                <div className="text-sm font-medium text-slate-200 truncate">{email || ""}</div>
              </div>
              <div className="my-2 border-t border-white/[0.06]" />
              <button
                className="w-full text-left rounded-lg px-2 py-2 text-sm text-slate-300 hover:bg-white/[0.06]"
                onClick={() => {
                  setMenuOpen(false);
                  setPwdOpen(true);
                }}
              >
                Update password
              </button>
              <button className="w-full text-left rounded-lg px-2 py-2 text-sm text-slate-300 hover:bg-white/[0.06]" onClick={signOut}>
                Sign out
              </button>
            </div>
          )}
          </div>
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
            <label className="text-xs text-slate-400">New password</label>
            <Input type="password" value={p1} onChange={(e) => setP1(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-slate-400">Confirm new password</label>
            <Input type="password" value={p2} onChange={(e) => setP2(e.target.value)} />
          </div>
          {err && <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-2">{err}</div>}
        </div>
      </Modal>
    </header>
  );
}
