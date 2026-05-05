"use client";

import { useState } from "react";

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return "Not synced yet";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays === 1) return "Yesterday";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function SyncNowButton({
  accountId,
  syncStatus,
  lastSyncedAt,
  syncError,
  onSyncStart,
  onSyncComplete,
}: {
  accountId: string;
  syncStatus: "idle" | "syncing" | "error";
  lastSyncedAt: string | null;
  syncError: string | null;
  onSyncStart: () => void;
  onSyncComplete: () => void;
}) {
  const [requesting, setRequesting] = useState(false);

  async function handleClick() {
    if (syncStatus === "syncing" || requesting) return;
    setRequesting(true);
    onSyncStart();
    try {
      await fetch("/api/sync/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId }),
      });
    } catch (err) {
      console.error("Sync request failed:", err);
    } finally {
      setRequesting(false);
      onSyncComplete();
    }
  }

  if (syncStatus === "syncing") {
    return (
      <div className="flex items-center gap-1.5">
        <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
        <span className="text-xs text-emerald-400">Syncing…</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <div className="flex flex-col items-end gap-0.5">
        <div className="flex items-center gap-1.5">
          {syncStatus === "error" && syncError && (
            <span
              className="text-xs text-amber-400 cursor-help"
              title={syncError.slice(0, 100)}
            >
              ⚠
            </span>
          )}
          <button
            onClick={handleClick}
            disabled={requesting}
            className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Sync now
          </button>
        </div>
        <span className="text-[10px] text-slate-500">
          {formatRelativeTime(lastSyncedAt)}
        </span>
      </div>
    </div>
  );
}
