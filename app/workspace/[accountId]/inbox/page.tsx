"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import { WorkspaceShell } from "@/src/components/workspace/WorkspaceShell";
import { useWorkspace } from "@/src/components/workspace/WorkspaceContext";
import { FolderList } from "@/src/components/workspace/FolderList";
import { ConversationListItem } from "@/src/components/workspace/ConversationListItem";
import { ConversationDetail } from "@/src/components/workspace/ConversationDetail";
// Input from ui.tsx doesn't forward refs; using plain <input> for search
import {
  listConversations,
  listEmailsInConversation,
  setConversationUserState,
} from "@/src/lib/supabase/workspace-queries";
import type { Conversation, EmailUserState } from "@/src/lib/types/workspace";

const USER_STATE_FILTERS: { value: EmailUserState | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "inbox", label: "Inbox" },
  { value: "handled", label: "Handled" },
  { value: "followup", label: "Follow-up" },
  { value: "snoozed", label: "Snoozed" },
];

function InboxContent() {
  const { workspace, activeProjectId } = useWorkspace();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConv, setSelectedConv] = useState<Conversation | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [userStateFilter, setUserStateFilter] = useState<EmailUserState | "all">("inbox");
  const [folderId, setFolderId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(search), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search]);

  const fetchConversations = useCallback(() => {
    setLoading(true);
    listConversations(workspace.id, {
      folderId: folderId ?? undefined,
      userState: userStateFilter,
      projectId: activeProjectId,
      search: debouncedSearch || undefined,
      limit: 50,
    })
      .then((data) => {
        setConversations(data);
        setSelectedConv(null);
        setSelectedIndex(-1);
      })
      .catch(() => setConversations([]))
      .finally(() => setLoading(false));
  }, [workspace.id, activeProjectId, debouncedSearch, userStateFilter, folderId]);

  useEffect(() => { fetchConversations(); }, [fetchConversations]);

  const handleSelectConv = useCallback((conv: Conversation, index: number) => {
    setSelectedConv(conv);
    setSelectedIndex(index);
  }, []);

  const handleMoveAction = useCallback(async (action: "archive" | "trash" | "delete") => {
    if (!selectedConv) return;
    if (action === "delete" && !confirm("Permanently delete this conversation?")) return;
    const emails = await listEmailsInConversation(selectedConv.id);
    for (const email of emails) {
      await fetch("/api/email/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: workspace.id, emailId: email.id, action }),
      });
    }
    setConversations((prev) => prev.filter((c) => c.id !== selectedConv.id));
    setSelectedConv(null);
    setSelectedIndex(-1);
  }, [selectedConv, workspace.id]);

  const handleUserState = useCallback(async (
    state: EmailUserState | null,
    options?: { followupDueAt?: Date | null; snoozedUntil?: Date | null }
  ) => {
    if (!selectedConv) return;
    try {
      await setConversationUserState(selectedConv.id, state, options);
      // Refresh list to reflect state change
      fetchConversations();
    } catch { /* ignore */ }
  }, [selectedConv, fetchConversations]);

  // Keyboard shortcuts
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.target instanceof HTMLElement && e.target.isContentEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      switch (e.key.toLowerCase()) {
        case "j": {
          e.preventDefault();
          const next = Math.min(selectedIndex + 1, conversations.length - 1);
          if (conversations[next]) handleSelectConv(conversations[next], next);
          break;
        }
        case "k": {
          e.preventDefault();
          const prev = Math.max(selectedIndex - 1, 0);
          if (conversations[prev]) handleSelectConv(conversations[prev], prev);
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
        case "/": {
          e.preventDefault();
          searchRef.current?.focus();
          break;
        }
        case "escape": {
          setSelectedConv(null);
          setSelectedIndex(-1);
          break;
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedIndex, conversations, handleSelectConv, handleMoveAction]);

  const hasFilters = !!debouncedSearch || userStateFilter !== "inbox";

  return (
    <div className="flex h-[calc(100vh-160px)] gap-0">
      {/* Left: folder tree */}
      <div className="w-48 shrink-0 border-r border-white/[0.06] pr-2 overflow-y-auto">
        <FolderList accountId={workspace.id} selectedFolderId={folderId} onFolderSelect={setFolderId} />
      </div>

      {/* Center: conversation list */}
      <div className="w-[35%] flex flex-col min-w-0 px-2">
        <div className="mb-2">
          <input
            ref={searchRef}
            placeholder="Search conversations… (/ to focus)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-base px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/50"
          />
        </div>

        {/* User state filter chips */}
        <div className="flex flex-wrap gap-1 mb-2">
          {USER_STATE_FILTERS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setUserStateFilter(opt.value)}
              className={[
                "px-2 py-1 rounded text-[11px] font-medium transition-colors border",
                userStateFilter === opt.value
                  ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-300"
                  : "bg-transparent border-white/[0.06] text-slate-400 hover:bg-white/[0.04]",
              ].join(" ")}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto rounded-lg border border-white/[0.06] bg-surface">
          {loading ? (
            <p className="p-4 text-sm text-slate-500 italic">Loading…</p>
          ) : conversations.length === 0 ? (
            <div className="p-6 text-center">
              <p className="text-sm text-slate-500">
                {hasFilters ? "No conversations match your filters." : "No conversations in this folder."}
              </p>
            </div>
          ) : (
            conversations.map((conv, idx) => (
              <ConversationListItem
                key={conv.id}
                conversation={conv}
                isSelected={selectedConv?.id === conv.id}
                onClick={() => handleSelectConv(conv, idx)}
              />
            ))
          )}
        </div>
      </div>

      {/* Right: conversation detail */}
      <div className="flex-1 overflow-y-auto bg-surface rounded-lg border border-white/[0.06] ml-2">
        <ConversationDetail
          conversationId={selectedConv?.id ?? null}
          onMoveAction={handleMoveAction}
          onUserState={handleUserState}
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
