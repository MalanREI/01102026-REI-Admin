"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import { WorkspaceShell } from "@/src/components/workspace/WorkspaceShell";
import { useWorkspace } from "@/src/components/workspace/WorkspaceContext";
import { EmailListItem } from "@/src/components/workspace/EmailListItem";
import { EmailDetail } from "@/src/components/workspace/EmailDetail";
import { Input } from "@/src/components/ui";
import { listEmails, markEmailRead, starEmail } from "@/src/lib/supabase/workspace-queries";
import type { Email, TriageCategory } from "@/src/lib/types/workspace";

const TRIAGE_OPTIONS: { value: TriageCategory | null; label: string }[] = [
  { value: null, label: "All" },
  { value: "needs_response", label: "Needs Response" },
  { value: "action_required", label: "Action Required" },
  { value: "decision_needed", label: "Decision Needed" },
  { value: "fyi", label: "FYI" },
  { value: "cc_only", label: "Cc Only" },
];

const FOLDER_OPTIONS = [
  { value: "all", label: "All" },
  { value: "inbox", label: "Inbox" },
  { value: "sentitems", label: "Sent" },
];

function InboxContent() {
  const { workspace, activeProjectId } = useWorkspace();

  const [emails, setEmails] = useState<Email[]>([]);
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [triageCategory, setTriageCategory] = useState<TriageCategory | null>(null);
  const [isReadFilter, setIsReadFilter] = useState<"all" | "unread">("all");
  const [folderFilter, setFolderFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(search), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search]);

  // Fetch emails
  useEffect(() => {
    setLoading(true);
    listEmails(workspace.id, {
      projectId: activeProjectId,
      triageCategory: triageCategory ?? undefined,
      isRead: isReadFilter === "unread" ? false : undefined,
      search: debouncedSearch || undefined,
      limit: 50,
    })
      .then((data) => {
        const filtered = folderFilter === "all"
          ? data
          : data.filter((e) => e.folder_id === folderFilter);
        setEmails(filtered);
      })
      .catch((err) => {
        console.error("Failed to load emails:", err);
        setEmails([]);
      })
      .finally(() => setLoading(false));
  }, [workspace.id, activeProjectId, debouncedSearch, triageCategory, isReadFilter, folderFilter]);

  const handleSelectEmail = useCallback((email: Email) => {
    setSelectedEmail(email);
    if (!email.is_read) {
      markEmailRead(email.id, true).catch(() => {});
      setEmails((prev) =>
        prev.map((e) => (e.id === email.id ? { ...e, is_read: true } : e))
      );
      setSelectedEmail((prev) => prev && prev.id === email.id ? { ...prev, is_read: true } : prev);
    }
  }, []);

  const handleMarkRead = useCallback((isRead: boolean) => {
    if (!selectedEmail) return;
    markEmailRead(selectedEmail.id, isRead).catch(() => {});
    setEmails((prev) =>
      prev.map((e) => (e.id === selectedEmail.id ? { ...e, is_read: isRead } : e))
    );
    setSelectedEmail((prev) => prev ? { ...prev, is_read: isRead } : prev);
  }, [selectedEmail]);

  const handleStar = useCallback((isStarred: boolean) => {
    if (!selectedEmail) return;
    starEmail(selectedEmail.id, isStarred).catch(() => {});
    setEmails((prev) =>
      prev.map((e) => (e.id === selectedEmail.id ? { ...e, is_starred: isStarred } : e))
    );
    setSelectedEmail((prev) => prev ? { ...prev, is_starred: isStarred } : prev);
  }, [selectedEmail]);

  const hasFilters = !!debouncedSearch || triageCategory !== null || isReadFilter !== "all" || folderFilter !== "all";

  return (
    <div className="flex h-[calc(100vh-160px)] gap-4">
      {/* Left: filter bar + email list */}
      <div className="w-2/5 flex flex-col min-w-0">
        {/* Search */}
        <div className="mb-2">
          <Input
            placeholder="Search emails…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Filter chips */}
        <div className="space-y-2 mb-3">
          {/* Triage */}
          <div className="flex flex-wrap gap-1">
            {TRIAGE_OPTIONS.map((opt) => (
              <button
                key={opt.label}
                onClick={() => setTriageCategory(opt.value)}
                className={[
                  "px-2 py-1 rounded text-[11px] font-medium transition-colors border",
                  triageCategory === opt.value
                    ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-300"
                    : "bg-transparent border-white/[0.06] text-slate-400 hover:bg-white/[0.04] hover:text-slate-300",
                ].join(" ")}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Read state + folder */}
          <div className="flex items-center gap-2">
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

            <div className="h-3 w-px bg-white/[0.06]" />

            {FOLDER_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setFolderFilter(opt.value)}
                className={[
                  "px-2 py-1 rounded text-[11px] font-medium transition-colors border",
                  folderFilter === opt.value
                    ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-300"
                    : "bg-transparent border-white/[0.06] text-slate-400 hover:bg-white/[0.04]",
                ].join(" ")}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Email list */}
        <div className="flex-1 overflow-y-auto rounded-lg border border-white/[0.06] bg-surface">
          {loading ? (
            <p className="p-4 text-sm text-slate-500 italic">Loading…</p>
          ) : emails.length === 0 ? (
            <div className="p-6 text-center">
              <p className="text-sm text-slate-500">
                {hasFilters
                  ? "No emails match your filters."
                  : "Inbox is empty — click 'Sync now' in the topbar."}
              </p>
            </div>
          ) : (
            emails.map((email) => (
              <EmailListItem
                key={email.id}
                email={email}
                isSelected={selectedEmail?.id === email.id}
                onClick={() => handleSelectEmail(email)}
              />
            ))
          )}
        </div>
      </div>

      {/* Right: detail pane */}
      <div className="w-3/5 overflow-y-auto bg-surface rounded-lg border border-white/[0.06]">
        <EmailDetail
          email={selectedEmail}
          onMarkRead={handleMarkRead}
          onStar={handleStar}
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
