"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Pill } from "@/src/components/ui";
import { askClaude, getWorkspace, listRecentAskQueries } from "@/src/lib/supabase/workspace-queries";
import type { AskQuery, AskQueryScope } from "@/src/lib/types/workspace";

function isInWorkspace(pathname: string): boolean {
  return /^\/workspace\/[0-9a-f-]{8,}/i.test(pathname);
}

function extractAccountId(pathname: string): string | null {
  const match = pathname.match(/^\/workspace\/([0-9a-f-]{8,})/i);
  return match ? match[1] : null;
}

export function AskClaudeBar({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const pathname = usePathname();
  const inputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<AskQueryScope>("all_workspaces");
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [recentQueries, setRecentQueries] = useState<AskQuery[]>([]);
  const [currentWorkspaceName, setCurrentWorkspaceName] = useState<string>("this workspace");

  const accountId = isInWorkspace(pathname) ? extractAccountId(pathname) : null;

  // Global Cmd+K / Ctrl+K listener
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        onOpenChange(true);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onOpenChange]);

  // ESC listener when open
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onOpenChange(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onOpenChange]);

  // Set scope and focus input on open
  useEffect(() => {
    if (!open) return;
    setScope(accountId ? "current_workspace" : "all_workspaces");
    setResult(null);
    setQuery("");
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [open, accountId]);

  // Fetch workspace name for scope explanation
  useEffect(() => {
    if (!open || !accountId) {
      setCurrentWorkspaceName("this workspace");
      return;
    }
    getWorkspace(accountId)
      .then((ws) => setCurrentWorkspaceName(ws?.display_name ?? "this workspace"))
      .catch(() => setCurrentWorkspaceName("this workspace"));
  }, [open, accountId]);

  // Fetch recent queries on open
  useEffect(() => {
    if (!open) return;
    listRecentAskQueries({ limit: 5 })
      .then(setRecentQueries)
      .catch(() => setRecentQueries([]));
  }, [open]);

  const handleSubmit = useCallback(async () => {
    if (!query.trim() || isLoading) return;
    setIsLoading(true);
    setResult(null);
    try {
      await askClaude(query, {
        accountId: scope === "current_workspace" ? accountId ?? undefined : undefined,
      });
    } catch (err: unknown) {
      setResult((err as Error)?.message ?? "An unexpected error occurred.");
    } finally {
      setIsLoading(false);
    }
  }, [query, scope, accountId, isLoading]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    }
  };

  const toggleScope = () => {
    setScope((s) => (s === "current_workspace" ? "all_workspaces" : "current_workspace"));
  };

  if (!open) return null;

  const scopeExplanation =
    scope === "current_workspace"
      ? `Searching across emails, attachments, meetings, and notes in ${currentWorkspaceName}.`
      : "Searching across all your connected workspaces.";

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-start justify-center pt-[15vh]"
      onClick={() => onOpenChange(false)}
    >
      <div
        className="w-full max-w-2xl bg-elevated border border-white/[0.08] rounded-xl shadow-xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Input row */}
        <div className="flex items-center gap-3">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask Claude anything about your workspace…"
            className="flex-1 bg-transparent text-lg text-slate-100 placeholder:text-slate-500 outline-none"
          />
          <button
            onClick={toggleScope}
            className="shrink-0"
          >
            <Pill>
              {scope === "current_workspace" ? "Current Workspace" : "All Workspaces"}
            </Pill>
          </button>
        </div>

        {/* Scope explanation */}
        <p className="text-xs text-slate-500 mt-2">{scopeExplanation}</p>

        {/* Divider */}
        <div className="border-t border-white/[0.06] my-4" />

        {/* Results / Recent / Loading */}
        {isLoading ? (
          <p className="text-sm text-slate-400 italic">Thinking…</p>
        ) : result ? (
          <div className="bg-white/[0.03] rounded-lg p-4 text-sm text-slate-300">
            {result}
          </div>
        ) : !query.trim() && recentQueries.length > 0 ? (
          <div>
            <p className="text-xs text-slate-500 mb-2">Recent</p>
            <div className="flex flex-wrap gap-2">
              {recentQueries.map((rq) => (
                <button
                  key={rq.id}
                  onClick={() => setQuery(rq.query)}
                  className="px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06] text-xs text-slate-300 hover:bg-white/[0.08] hover:text-slate-100 transition-colors truncate max-w-[200px]"
                >
                  {rq.query}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {/* Footer hint */}
        <div className="mt-4 pt-3 border-t border-white/[0.06]">
          <p className="text-xs text-slate-500">
            Enter to ask · ESC to close · ⌘K from anywhere
          </p>
        </div>
      </div>
    </div>
  );
}
