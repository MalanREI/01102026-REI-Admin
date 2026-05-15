"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import { WorkspaceShell } from "@/src/components/workspace/WorkspaceShell";
import { useWorkspace } from "@/src/components/workspace/WorkspaceContext";
import { FolderList } from "@/src/components/workspace/FolderList";
import { ConversationListItem } from "@/src/components/workspace/ConversationListItem";
import { ConversationDetail } from "@/src/components/workspace/ConversationDetail";
import { PaneSplit } from "@/src/components/workspace/PaneSplit";
import { Compose } from "@/src/components/workspace/Compose";
import {
  listConversations,
  listEmailsInConversation,
  setConversationUserState,
  getConversation,
} from "@/src/lib/supabase/workspace-queries";
import { formatEmailDateLong } from "@/src/lib/format";
import type { Conversation, Email, EmailUserState } from "@/src/lib/types/workspace";

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
  const [folderCollapsed, setFolderCollapsed] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeMode, setComposeMode] = useState<"compose" | "reply" | "replyAll" | "forward">("compose");
  const [composeContext, setComposeContext] = useState<{
    initialTo?: string[]; initialCc?: string[]; initialSubject?: string;
    initialBody?: string; inReplyToMessageId?: string;
  }>({});
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

  const openReplyForConversation = useCallback(async (mode: "reply" | "replyAll" | "forward") => {
    if (!selectedConv) return;
    const emails = await listEmailsInConversation(selectedConv.id);
    const newest = emails[emails.length - 1];
    if (!newest) return;
    const myEmail = workspace.email_address.toLowerCase();
    const subject = newest.subject ?? "";

    if (mode === "reply") {
      setComposeContext({
        initialTo: newest.from_address ? [newest.from_address] : [],
        initialSubject: subject.toLowerCase().startsWith("re:") ? subject : `Re: ${subject}`,
        inReplyToMessageId: newest.provider_message_id,
      });
    } else if (mode === "replyAll") {
      const extractAddr = (r: unknown) => (r as { emailAddress?: { address?: string } })?.emailAddress?.address ?? null;
      const allTo = [...new Set([newest.from_address, ...((newest.to_addresses ?? []) as unknown[]).map(extractAddr)].filter((a): a is string => !!a && a.toLowerCase() !== myEmail))];
      const allCc = ((newest.cc_addresses ?? []) as unknown[]).map(extractAddr).filter((a): a is string => !!a && a.toLowerCase() !== myEmail);
      setComposeContext({
        initialTo: allTo,
        initialCc: allCc,
        initialSubject: subject.toLowerCase().startsWith("re:") ? subject : `Re: ${subject}`,
        inReplyToMessageId: newest.provider_message_id,
      });
    } else {
      setComposeContext({
        initialTo: [],
        initialSubject: subject.toLowerCase().startsWith("fwd:") ? subject : `Fwd: ${subject}`,
        inReplyToMessageId: newest.provider_message_id,
      });
    }
    setComposeMode(mode);
    setComposeOpen(true);
  }, [selectedConv, workspace.email_address]);

  // Keyboard shortcuts
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.target instanceof HTMLElement && e.target.isContentEditable) return;

      // Cmd/Ctrl+N: new compose
      if ((e.metaKey || e.ctrlKey) && e.key === "n") {
        e.preventDefault();
        setComposeMode("compose");
        setComposeContext({});
        setComposeOpen(true);
        return;
      }

      if (e.metaKey || e.ctrlKey || e.altKey) return;

      switch (e.key) {
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
        case "r": {
          if (!selectedConv) break;
          e.preventDefault();
          openReplyForConversation(e.shiftKey ? "replyAll" : "reply");
          break;
        }
        case "f": {
          if (!selectedConv) break;
          e.preventDefault();
          openReplyForConversation("forward");
          break;
        }
        case "Escape": {
          setSelectedConv(null);
          setSelectedIndex(-1);
          break;
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedIndex, conversations, handleSelectConv, handleMoveAction, selectedConv]);

  const hasFilters = !!debouncedSearch || userStateFilter !== "inbox";

  return (
    <div className="h-[calc(100vh-160px)]">
      <PaneSplit
        storageKey="inbox-folder-pane"
        defaultLeftWidth={224}
        minLeftWidth={140}
        maxLeftWidth={320}
        collapsible
        collapsed={folderCollapsed}
        onCollapsedChange={setFolderCollapsed}
        leftPane={
          <div className="h-full overflow-y-auto pr-2">
            <FolderList accountId={workspace.id} selectedFolderId={folderId} onFolderSelect={setFolderId} />
          </div>
        }
        rightPane={
          <PaneSplit
            storageKey="inbox-list-pane"
            defaultLeftWidth={400}
            minLeftWidth={280}
            maxLeftWidth={700}
            leftPane={
              <div className="flex flex-col h-full px-2">
                <div className="flex items-center gap-2 mb-2">
                  {folderCollapsed && (
                    <button
                      onClick={() => setFolderCollapsed(false)}
                      className="text-xs text-slate-400 hover:text-slate-200 shrink-0"
                    >
                      ☰
                    </button>
                  )}
                  <input
                    ref={searchRef}
                    placeholder="Search… (/ to focus)"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="flex-1 rounded-lg border border-white/10 bg-base px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/50"
                  />
                </div>

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
            }
            rightPane={
              <div className="h-full overflow-y-auto bg-surface rounded-lg border border-white/[0.06]">
                <ConversationDetail
                  conversationId={selectedConv?.id ?? null}
                  onMoveAction={handleMoveAction}
                  onUserState={handleUserState}
                />
              </div>
            }
          />
        }
      />

      <Compose
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        accountId={workspace.id}
        mode={composeMode}
        {...composeContext}
        onSent={fetchConversations}
      />
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
