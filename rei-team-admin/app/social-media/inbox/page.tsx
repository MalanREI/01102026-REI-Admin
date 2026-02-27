"use client";

import { useEffect, useState, useCallback } from "react";
import { PageShell } from "@/src/components/PageShell";
import { Button, Dropdown } from "@/src/components/ui";

// ── Types ─────────────────────────────────────────────────────────────────────

type EngagementType = "comment" | "dm" | "mention" | "review";
type SentimentType = "positive" | "neutral" | "negative";

interface InboxItem {
  id: string;
  platform_item_id: string;
  type: EngagementType;
  author_name: string;
  author_avatar_url: string | null;
  content: string;
  sentiment: SentimentType | null;
  is_read: boolean;
  is_replied: boolean;
  received_at: string;
  social_platforms: { platform_name: string; account_name: string } | null;
  content_posts: { id: string; title: string | null; body: string } | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const PLATFORM_LABELS: Record<string, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  google_business: "Google Business",
};

const PLATFORM_COLORS: Record<string, string> = {
  instagram: "bg-pink-600",
  facebook: "bg-blue-600",
  linkedin: "bg-sky-600",
  google_business: "bg-green-600",
};

const TYPE_LABELS: Record<EngagementType, string> = {
  comment: "Comment",
  dm: "DM",
  mention: "Mention",
  review: "Review",
};

const SENTIMENT_COLORS: Record<SentimentType, string> = {
  positive: "text-emerald-400",
  neutral: "text-slate-400",
  negative: "text-red-400",
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ── Inbox item row ────────────────────────────────────────────────────────────

function InboxRow({
  item,
  onMarkRead,
  onSentimentChange,
}: {
  item: InboxItem;
  onMarkRead: (id: string) => void;
  onSentimentChange: (id: string, sentiment: SentimentType) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [reply, setReply] = useState("");
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [loadingSuggest, setLoadingSuggest] = useState(false);
  const [sendingReply, setSendingReply] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [replySent, setReplySent] = useState(item.is_replied);

  const platform =
    item.social_platforms?.platform_name ?? "unknown";

  async function handleSuggest() {
    setLoadingSuggest(true);
    setSuggestion(null);
    try {
      const res = await fetch("/api/engagement/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inbox_item_id: item.id, generate_only: true }),
      });
      const data = await res.json();
      if (data.suggestion) {
        setSuggestion(data.suggestion);
        setReply(data.suggestion);
      }
    } finally {
      setLoadingSuggest(false);
    }
  }

  async function handleSendReply() {
    if (!reply.trim()) return;
    setSendingReply(true);
    setReplyError(null);
    try {
      const res = await fetch("/api/engagement/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inbox_item_id: item.id,
          reply_content: reply,
          is_ai_generated: reply === suggestion,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to send reply");
      setReplySent(true);
      setReply("");
      setSuggestion(null);
    } catch (err) {
      setReplyError(err instanceof Error ? err.message : "Send failed");
    } finally {
      setSendingReply(false);
    }
  }

  return (
    <div
      className={`border-b border-white/[0.04] transition-colors ${
        !item.is_read ? "bg-white/[0.02]" : ""
      }`}
    >
      {/* Row header */}
      <div
        className="flex items-start gap-3 px-4 py-4 cursor-pointer hover:bg-white/[0.02]"
        onClick={() => {
          setExpanded((e) => !e);
          if (!item.is_read) onMarkRead(item.id);
        }}
      >
        {/* Avatar */}
        <div className="w-8 h-8 rounded-full bg-slate-700 shrink-0 flex items-center justify-center text-xs font-medium text-slate-300">
          {item.author_name.charAt(0).toUpperCase()}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-slate-200">
              {item.author_name}
            </span>
            <span
              className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium text-white ${
                PLATFORM_COLORS[platform] ?? "bg-slate-600"
              }`}
            >
              {PLATFORM_LABELS[platform] ?? platform}
            </span>
            <span className="text-[10px] text-slate-500 bg-white/[0.04] px-1.5 py-0.5 rounded">
              {TYPE_LABELS[item.type]}
            </span>
            {item.sentiment && (
              <span
                className={`text-[10px] ${SENTIMENT_COLORS[item.sentiment]}`}
              >
                {item.sentiment}
              </span>
            )}
            {replySent && (
              <span className="text-[10px] text-emerald-400">✓ Replied</span>
            )}
            {!item.is_read && (
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
            )}
          </div>
          <div className="text-sm text-slate-400 mt-0.5 truncate">
            {item.content}
          </div>
        </div>

        <div className="text-xs text-slate-500 shrink-0">
          {timeAgo(item.received_at)}
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-4 pb-4 space-y-3 ml-11">
          {/* Full content */}
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 text-sm text-slate-300">
            {item.content}
          </div>

          {/* Sentiment selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Sentiment:</span>
            {(["positive", "neutral", "negative"] as SentimentType[]).map(
              (s) => (
                <button
                  key={s}
                  onClick={() => onSentimentChange(item.id, s)}
                  className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                    item.sentiment === s
                      ? `border-current ${SENTIMENT_COLORS[s]}`
                      : "border-white/[0.08] text-slate-500 hover:text-slate-300"
                  }`}
                >
                  {s}
                </button>
              )
            )}
          </div>

          {/* Reply box */}
          {!replySent && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">Reply</span>
                <button
                  onClick={handleSuggest}
                  disabled={loadingSuggest}
                  className="text-xs text-blue-400 hover:text-blue-300 disabled:opacity-50"
                >
                  {loadingSuggest ? "Generating…" : "✦ Suggest reply"}
                </button>
              </div>
              <textarea
                rows={3}
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder="Write a reply…"
                className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-slate-200 placeholder-slate-600 resize-none focus:outline-none focus:ring-1 focus:ring-blue-500/50"
              />
              {replyError && (
                <div className="text-xs text-red-400">{replyError}</div>
              )}
              <div className="flex justify-end">
                <Button
                  onClick={handleSendReply}
                  disabled={sendingReply || !reply.trim()}
                >
                  {sendingReply ? "Sending…" : "Send Reply"}
                </Button>
              </div>
            </div>
          )}

          {replySent && (
            <div className="text-xs text-emerald-400">
              Reply sent successfully.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SocialMediaInboxPage() {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  // Filters
  const [filterPlatform, setFilterPlatform] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterRead, setFilterRead] = useState("");

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "50" });
      if (filterPlatform) params.set("platform", filterPlatform);
      if (filterType) params.set("type", filterType);
      if (filterRead) params.set("is_read", filterRead);

      const res = await fetch(`/api/engagement?${params.toString()}`);
      const data = await res.json();
      setItems(data.items ?? []);
      setTotal(data.total ?? 0);
    } finally {
      setLoading(false);
    }
  }, [filterPlatform, filterType, filterRead]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  async function handleSync() {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch(`/api/cron/engagement?secret=${process.env.NEXT_PUBLIC_CRON_SECRET ?? ""}`);
      const data = await res.json();
      setSyncResult(`Fetched ${data.inserted} new items`);
      await loadItems();
    } catch {
      setSyncResult("Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  async function handleMarkRead(id: string) {
    await fetch("/api/engagement", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, is_read: true }),
    });
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, is_read: true } : i))
    );
  }

  async function handleSentimentChange(
    id: string,
    sentiment: SentimentType
  ) {
    await fetch("/api/engagement", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, sentiment }),
    });
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, sentiment } : i))
    );
  }

  const unreadCount = items.filter((i) => !i.is_read).length;

  return (
    <PageShell>
      <div className="max-w-4xl space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold">Engagement Inbox</h1>
              {unreadCount > 0 && (
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-500 text-[11px] font-bold text-white">
                  {unreadCount}
                </span>
              )}
            </div>
            <div className="text-sm text-slate-400 mt-1">
              {total} item{total !== 1 ? "s" : ""} total
            </div>
          </div>
          <Button onClick={handleSync} disabled={syncing} variant="ghost">
            {syncing ? "Syncing…" : "Sync Now"}
          </Button>
        </div>

        {syncResult && (
          <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-400">
            {syncResult}
          </div>
        )}

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <Dropdown
            label={filterPlatform ? PLATFORM_LABELS[filterPlatform] : "All platforms"}
            items={[
              { label: "All platforms", onClick: () => setFilterPlatform("") },
              ...Object.entries(PLATFORM_LABELS).map(([k, v]) => ({
                label: v,
                onClick: () => setFilterPlatform(k),
              })),
            ]}
          />
          <Dropdown
            label={filterType ? TYPE_LABELS[filterType as EngagementType] : "All types"}
            items={[
              { label: "All types", onClick: () => setFilterType("") },
              ...Object.entries(TYPE_LABELS).map(([k, v]) => ({
                label: v,
                onClick: () => setFilterType(k),
              })),
            ]}
          />
          <Dropdown
            label={
              filterRead === "" ? "All" : filterRead === "false" ? "Unread" : "Read"
            }
            items={[
              { label: "All", onClick: () => setFilterRead("") },
              { label: "Unread", onClick: () => setFilterRead("false") },
              { label: "Read", onClick: () => setFilterRead("true") },
            ]}
          />
        </div>

        {/* Item list */}
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-sm text-slate-500">
              Loading…
            </div>
          ) : items.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              No engagement items yet. Click &quot;Sync Now&quot; to fetch comments and reviews from connected platforms.
            </div>
          ) : (
            items.map((item) => (
              <InboxRow
                key={item.id}
                item={item}
                onMarkRead={handleMarkRead}
                onSentimentChange={handleSentimentChange}
              />
            ))
          )}
        </div>
      </div>
    </PageShell>
  );
}
