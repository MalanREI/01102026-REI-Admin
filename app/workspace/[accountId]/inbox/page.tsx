"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import { WorkspaceShell } from "@/src/components/workspace/WorkspaceShell";
import { useWorkspace } from "@/src/components/workspace/WorkspaceContext";
import { FolderList } from "@/src/components/workspace/FolderList";
import { EmailListItem } from "@/src/components/workspace/EmailListItem";
import { EmailDetail } from "@/src/components/workspace/EmailDetail";
import { Input } from "@/src/components/ui";
import { listEmails, markEmailRead, starEmail, setEmailUserState } from "@/src/lib/supabase/workspace-queries";
import type { Email, TriageCategory } from "@/src/lib/types/workspace";

const TRIAGE_OPTIONS: { value: TriageCategory | null; label: string }[] = [
  { value: null, label: "All" },
  { value: "needs_response", label: "Needs Response" },
  { value: "action_required", label: "Action Required" },
  { value: "decision_needed", label: "Decision Needed" },
  { value: "fyi", label: "FYI" },
  { value: "cc_only", label: "Cc Only" },
];

function InboxContent() {
  const { workspace, activeProjectId } = useWorkspace();

  const [emails, setEmails] = useState<Email[]>([]);
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [triageCategory, setTriageCategory] = useState<TriageCategory | null>(null);
  const [isReadFilter, setIsReadFilter] = useState<"all" | "unread">("all");
  const [folderId, setFolderId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Debounce search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(search), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search]);

  // Fetch emails
  const fetchEmails = useCallback(() => {
    setLoading(true);
    listEmails(workspace.id, {
      projectId: activeProjectId,
      folderId: folderId ?? undefined,
      triageCategory: triageCategory ?? undefined,
      isRead: isReadFilter === "unread" ? false : undefined,
      search: debouncedSearch || undefined,
      limit: 50,
    })
      .then((data) => {
        setEmails(data);
        setSelectedEmail(null);
        setSelectedIndex(-1);
      })
      .catch((err) => {
        console.error("Failed to load emails:", err);
        setEmails([]);
      })
      .finally(() => setLoading(false));
  }, [workspace.id, activeProjectId, debouncedSearch, triageCategory, isReadFilter, folderId]);

  useEffect(() => { fetchEmails(); }, [fetchEmails]);

  const handleSelectEmail = useCallback((email: Email, index: number) => {
    setSelectedEmail(email);
    setSelectedIndex(index);
    if (!email.is_read) {
      markEmailRead(email.id, true).catch(() => {});
      setEmails((prev) => prev.map((e) => (e.id === email.id ? { ...e, is_read: true } : e)));
    }
  }, []);

  const handleMarkRead = useCallback((isRead: boolean) => {
    if (!selectedEmail) return;
    markEmailRead(selectedEmail.id, isRead).catch(() => {});
    setEmails((prev) => prev.map((e) => (e.id === selectedEmail.id ? { ...e, is_read: isRead } : e)));
    setSelectedEmail((prev) => prev ? { ...prev, is_read: isRead } : prev);
  }, [selectedEmail]);

  const handleStar = useCallback((isStarred: boolean) => {
    if (!selectedEmail) return;
    starEmail(selectedEmail.id, isStarred).catch(() => {});
    setEmails((prev) => prev.map((e) => (e.id === selectedEmail.id ? { ...e, is_starred: isStarred } : e)));
    setSelectedEmail((prev) => prev ? { ...prev, is_starred: isStarred } : prev);
  }, [selectedEmail]);

  const handleUserState = useCallback((state: 'inbox' | 'handled' | 'followup' | 'snoozed' | null) => {
    if (!selectedEmail) return;
    setEmailUserState(selectedEmail.id, state).catch(() => {});
    setEmails((prev) => prev.map((e) => (e.id === selectedEmail.id ? { ...e, user_state: state } : e)));
    setSelectedEmail((prev) => prev ? { ...prev, user_state: state } : prev);
  }, [selectedEmail]);

  const handleMoveAction = useCallback(async (action: 'archive' | 'trash' | 'delete') => {
    if (!selectedEmail) return;
    if (action === 'delete' && !confirm('Permanently delete this email?')) return;
    try {
      const res = await fetch('/api/email/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: workspace.id, emailId: selectedEmail.id, action }),
      });
      if (res.ok) {
        setEmails((prev) => prev.filter((e) => e.id !== selectedEmail.id));
        setSelectedEmail(null);
        setSelectedIndex(-1);
      }
    } catch { /* ignore */ }
  }, [selectedEmail, workspace.id]);

  // Keyboard shortcuts
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.target instanceof HTMLElement && e.target.isContentEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      switch (e.key.toLowerCase()) {
        case "j": {
          e.preventDefault();
          const next = Math.min(selectedIndex + 1, emails.length - 1);
          if (emails[next]) handleSelectEmail(emails[next], next);
          break;
        }
        case "k": {
          e.preventDefault();
          const prev = Math.max(selectedIndex - 1, 0);
          if (emails[prev]) handleSelectEmail(emails[prev], prev);
          break;
        }
        case "e": {
          e.preventDefault();
          handleMoveAction("archive");
          break;
        }
        case "#": {
          e.preventDefault();
          handleMoveAction("trash");
          break;
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedIndex, emails, handleSelectEmail, handleMoveAction]);

  const hasFilters = !!debouncedSearch || triageCategory !== null || isReadFilter !== "all";

  return (
    <div className="flex h-[calc(100vh-160px)] gap-0">
      {/* Left: folder tree */}
      <div className="w-48 shrink-0 border-r border-white/[0.06] pr-2 overflow-y-auto">
        <FolderList
          accountId={workspace.id}
          selectedFolderId={folderId}
          onFolderSelect={setFolderId}
        />
      </div>

      {/* Center: email list */}
      <div className="w-[35%] flex flex-col min-w-0 px-2">
        <div className="mb-2">
          <Input placeholder="Search emails…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        {/* Filter chips */}
        <div className="space-y-2 mb-2">
          <div className="flex flex-wrap gap-1">
            {TRIAGE_OPTIONS.map((opt) => (
              <button
                key={opt.label}
                onClick={() => setTriageCategory(opt.value)}
                className={[
                  "px-2 py-1 rounded text-[11px] font-medium transition-colors border",
                  triageCategory === opt.value
                    ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-300"
                    : "bg-transparent border-white/[0.06] text-slate-400 hover:bg-white/[0.04]",
                ].join(" ")}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => setIsReadFilter((v) => (v === "all" ? "unread" : "all"))}
            className={[
              "px-2 py-1 rounded text-[11px] font-medium transition-colors border",
              isReadFilter === "unread"
                ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-300"
                : "bg-transparent border-white/[0.06] text-slate-400 hover:bg-white/[0.04]",
            ].join(" ")}
          >
            Unread only
          </button>
        </div>

        <div ref={listRef} className="flex-1 overflow-y-auto rounded-lg border border-white/[0.06] bg-surface">
          {loading ? (
            <p className="p-4 text-sm text-slate-500 italic">Loading…</p>
          ) : emails.length === 0 ? (
            <div className="p-6 text-center">
              <p className="text-sm text-slate-500">
                {hasFilters ? "No emails match your filters." : "No emails in this folder."}
              </p>
            </div>
          ) : (
            emails.map((email, idx) => (
              <EmailListItem
                key={email.id}
                email={email}
                isSelected={selectedEmail?.id === email.id}
                onClick={() => handleSelectEmail(email, idx)}
              />
            ))
          )}
        </div>
      </div>

      {/* Right: detail pane */}
      <div className="flex-1 overflow-y-auto bg-surface rounded-lg border border-white/[0.06] ml-2">
        <EmailDetail
          email={selectedEmail}
          onMarkRead={handleMarkRead}
          onStar={handleStar}
          onUserState={handleUserState}
          onArchive={() => handleMoveAction("archive")}
          onTrash={() => handleMoveAction("trash")}
          onDelete={() => handleMoveAction("delete")}
        />
      </div>
    </div>
  );
}

export default function WorkspaceInboxPage({ params }: { params: Promise<{ accountId: string }> }) {
  const { accountId } = use(params);
  return (
    <WorkspaceShell accountId={accountId}>
      <InboxContent />
    </WorkspaceShell>
  );
}
