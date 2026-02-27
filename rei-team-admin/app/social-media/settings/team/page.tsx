"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PageShell } from "@/src/components/PageShell";
import { Button, Modal } from "@/src/components/ui";
import type { TeamMember, TeamRole } from "@/src/lib/types/social-media";

const ROLE_LABELS: Record<TeamRole, string> = {
  creator: "Creator",
  manager: "Manager",
  admin: "Admin",
};

const ROLE_COLORS: Record<TeamRole, string> = {
  creator: "bg-blue-500/20 text-blue-300",
  manager: "bg-purple-500/20 text-purple-300",
  admin: "bg-amber-500/20 text-amber-300",
};

function MemberAvatar({ member }: { member: TeamMember }) {
  const initials = member.display_name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
  return (
    <div className="w-9 h-9 rounded-full bg-slate-700 flex items-center justify-center text-sm font-medium text-slate-200 shrink-0">
      {initials}
    </div>
  );
}

export default function TeamManagementPage() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState({ email: "", display_name: "", role: "creator" as TeamRole });
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const fetchMembers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/team-members");
      const data = res.ok ? await res.json() : [];
      setMembers(data);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchMembers(); }, [fetchMembers]);

  const handleRoleChange = async (member: TeamMember, role: TeamRole) => {
    setUpdatingId(member.id);
    await fetch("/api/team-members", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: member.id, role }),
    });
    setUpdatingId(null);
    fetchMembers();
  };

  const handleToggleActive = async (member: TeamMember) => {
    setUpdatingId(member.id);
    await fetch("/api/team-members", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: member.id, is_active: !member.is_active }),
    });
    setUpdatingId(null);
    fetchMembers();
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteForm.email.trim() || !inviteForm.display_name.trim()) {
      setInviteError("Email and name are required");
      return;
    }
    setInviteLoading(true);
    setInviteError("");
    try {
      const res = await fetch("/api/team-members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(inviteForm),
      });
      const json = await res.json();
      if (!res.ok) { setInviteError(json.error ?? "Invite failed"); return; }
      setInviteOpen(false);
      setInviteForm({ email: "", display_name: "", role: "creator" });
      fetchMembers();
    } catch (e) {
      setInviteError(String(e));
    } finally {
      setInviteLoading(false);
    }
  };

  return (
    <PageShell>
      <div className="max-w-3xl space-y-5">
        <div className="flex items-center gap-3">
          <Link href="/social-media/settings" className="text-slate-400 hover:text-slate-200 text-sm">
            ← Settings
          </Link>
          <span className="text-slate-600">/</span>
          <div className="flex-1">
            <h1 className="text-2xl font-semibold text-slate-100">Team & Permissions</h1>
            <p className="text-sm text-slate-400 mt-0.5">Manage team members and their roles.</p>
          </div>
          <Button onClick={() => { setInviteError(""); setInviteOpen(true); }}>+ Invite Member</Button>
        </div>

        {error && <div className="text-red-400 text-sm">{error}</div>}

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-16 rounded-xl bg-surface animate-pulse" />
            ))}
          </div>
        ) : members.length === 0 ? (
          <div className="rounded-xl border border-white/[0.06] bg-surface px-4 py-10 text-center text-sm text-slate-400">
            No team members yet. Invite your first member.
          </div>
        ) : (
          <div className="rounded-xl border border-white/[0.06] bg-surface divide-y divide-white/[0.04]">
            {members.map((member) => (
              <div key={member.id} className={`flex items-center gap-3 px-4 py-3 ${!member.is_active ? "opacity-50" : ""}`}>
                <MemberAvatar member={member} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-200 truncate">{member.display_name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_COLORS[member.role]}`}>
                      {ROLE_LABELS[member.role]}
                    </span>
                    {!member.is_active && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-slate-700 text-slate-400">Inactive</span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 truncate">{member.email}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <select
                    value={member.role}
                    disabled={updatingId === member.id}
                    onChange={(e) => handleRoleChange(member, e.target.value as TeamRole)}
                    className="rounded-lg border border-white/10 bg-base px-2 py-1 text-xs text-slate-200 disabled:opacity-50"
                  >
                    <option value="creator">Creator</option>
                    <option value="manager">Manager</option>
                    <option value="admin">Admin</option>
                  </select>
                  <Button
                    variant="ghost"
                    disabled={updatingId === member.id}
                    onClick={() => handleToggleActive(member)}
                    className={`text-xs px-2 py-1 ${member.is_active ? "text-red-400 hover:text-red-300" : "text-green-400 hover:text-green-300"}`}
                  >
                    {member.is_active ? "Deactivate" : "Reactivate"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        <Modal
          open={inviteOpen}
          title="Invite Team Member"
          onClose={() => setInviteOpen(false)}
        >
          <form onSubmit={handleInvite} className="space-y-4">
            {inviteError && (
              <div className="text-xs text-red-400 bg-red-900/20 rounded px-3 py-2">{inviteError}</div>
            )}
            <div className="space-y-1">
              <label className="text-xs text-slate-400">Full Name *</label>
              <input
                type="text"
                value={inviteForm.display_name}
                onChange={(e) => setInviteForm((f) => ({ ...f, display_name: e.target.value }))}
                placeholder="Jane Smith"
                className="w-full rounded-lg border border-white/10 bg-base px-3 py-2 text-sm text-slate-200 placeholder-slate-500"
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-slate-400">Email *</label>
              <input
                type="email"
                value={inviteForm.email}
                onChange={(e) => setInviteForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="jane@example.com"
                className="w-full rounded-lg border border-white/10 bg-base px-3 py-2 text-sm text-slate-200 placeholder-slate-500"
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-slate-400">Role</label>
              <select
                value={inviteForm.role}
                onChange={(e) => setInviteForm((f) => ({ ...f, role: e.target.value as TeamRole }))}
                className="w-full rounded-lg border border-white/10 bg-base px-3 py-2 text-sm text-slate-200"
              >
                <option value="creator">Creator — can create and edit own drafts</option>
                <option value="manager">Manager — can approve posts and manage content</option>
                <option value="admin">Admin — full access including settings and team</option>
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" type="button" onClick={() => setInviteOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={inviteLoading}>
                {inviteLoading ? "Sending Invite…" : "Send Invite"}
              </Button>
            </div>
          </form>
        </Modal>
      </div>
    </PageShell>
  );
}
