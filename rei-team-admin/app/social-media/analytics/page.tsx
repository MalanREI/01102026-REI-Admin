"use client";

import { useEffect, useState, useCallback } from "react";
import { PageShell } from "@/src/components/PageShell";
import { Card, Button, Dropdown } from "@/src/components/ui";

// ── Types ─────────────────────────────────────────────────────────────────────

interface AnalyticsSummary {
  totalImpressions: number;
  totalReach: number;
  totalLikes: number;
  totalComments: number;
  totalShares: number;
  avgEngagementRate: number;
  snapshotCount: number;
}

interface PlatformStat {
  impressions: number;
  reach: number;
  engagement_rate: number;
  posts: number;
}

interface TopPost {
  post_id: string;
  title: string | null;
  body: string;
  platform: string;
  engagement_rate: number;
  impressions: number;
  likes: number;
}

interface AnalyticsData {
  summary: AnalyticsSummary;
  byPlatform: Record<string, PlatformStat>;
  topPosts: TopPost[];
  days: number;
}

// ── Platform display helpers ──────────────────────────────────────────────────

const PLATFORM_LABELS: Record<string, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  google_business: "Google Business",
  tiktok: "TikTok",
  youtube: "YouTube",
};

const PLATFORM_COLORS: Record<string, string> = {
  instagram: "bg-pink-500",
  facebook: "bg-blue-600",
  linkedin: "bg-sky-600",
  google_business: "bg-green-600",
  tiktok: "bg-slate-500",
  youtube: "bg-red-600",
};

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-5 flex flex-col gap-1">
      <div className="text-xs text-slate-400 uppercase tracking-wide">{label}</div>
      <div className="text-2xl font-semibold text-slate-100">
        {typeof value === "number" ? value.toLocaleString() : value}
      </div>
      {sub && <div className="text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

// ── Bar chart (CSS-only) ──────────────────────────────────────────────────────

function BarChart({
  data,
  label,
}: {
  data: { name: string; value: number; color: string }[];
  label: string;
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="space-y-3">
      <div className="text-xs text-slate-400 uppercase tracking-wide">{label}</div>
      {data.map((d) => (
        <div key={d.name} className="space-y-1">
          <div className="flex justify-between text-xs text-slate-400">
            <span>{d.name}</span>
            <span>{d.value.toLocaleString()}</span>
          </div>
          <div className="h-2 w-full rounded-full bg-white/[0.06]">
            <div
              className={`h-2 rounded-full ${d.color} transition-all duration-500`}
              style={{ width: `${(d.value / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

const DAY_OPTIONS = [
  { label: "Last 7 days", value: "7" },
  { label: "Last 30 days", value: "30" },
  { label: "Last 90 days", value: "90" },
];

export default function SocialMediaAnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState("30");
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/analytics?days=${days}`);
      if (!res.ok) throw new Error("Failed to load analytics");
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  async function runSync() {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch(`/api/cron/analytics?secret=${process.env.NEXT_PUBLIC_CRON_SECRET ?? ""}`);
      const json = await res.json();
      setSyncResult(`Synced ${json.synced} posts (${json.failed} failed)`);
      await loadAnalytics();
    } catch {
      setSyncResult("Sync failed — check server logs");
    } finally {
      setSyncing(false);
    }
  }

  const { summary, byPlatform, topPosts } = data ?? {
    summary: null,
    byPlatform: {},
    topPosts: [],
  };

  const platformChartData = Object.entries(byPlatform ?? {}).map(([name, stat]) => ({
    name: PLATFORM_LABELS[name] ?? name,
    value: stat.impressions,
    color: PLATFORM_COLORS[name] ?? "bg-slate-500",
  }));

  const engagementChartData = Object.entries(byPlatform ?? {}).map(([name, stat]) => ({
    name: PLATFORM_LABELS[name] ?? name,
    value: parseFloat((stat.engagement_rate ?? 0).toFixed(2)),
    color: PLATFORM_COLORS[name] ?? "bg-slate-500",
  }));

  return (
    <PageShell>
      <div className="max-w-5xl space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Analytics</h1>
            <div className="text-sm text-slate-400 mt-1">
              Performance metrics across all connected platforms.
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Dropdown
              label={DAY_OPTIONS.find((o) => o.value === days)?.label ?? "Last 30 days"}
              items={DAY_OPTIONS.map((o) => ({
                label: o.label,
                onClick: () => setDays(o.value),
              }))}
            />
            <Button onClick={runSync} disabled={syncing} variant="ghost">
              {syncing ? "Syncing…" : "Sync Now"}
            </Button>
          </div>
        </div>

        {syncResult && (
          <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-400">
            {syncResult}
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-2 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Summary stats */}
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-5 h-24 animate-pulse"
              />
            ))}
          </div>
        ) : summary ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <StatCard label="Impressions" value={summary.totalImpressions} sub="Total views" />
            <StatCard label="Reach" value={summary.totalReach} sub="Unique accounts" />
            <StatCard label="Likes" value={summary.totalLikes} />
            <StatCard label="Comments" value={summary.totalComments} />
            <StatCard label="Shares" value={summary.totalShares} />
            <StatCard
              label="Avg Engagement"
              value={`${summary.avgEngagementRate}%`}
              sub={`${summary.snapshotCount} snapshots`}
            />
          </div>
        ) : (
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-8 text-center text-sm text-slate-400">
            No analytics data yet. Publish posts and click &quot;Sync Now&quot; to fetch metrics.
          </div>
        )}

        {/* Charts */}
        {!loading && platformChartData.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card title="Impressions by Platform">
              <BarChart data={platformChartData} label="Total impressions" />
            </Card>
            <Card title="Engagement Rate by Platform">
              <BarChart data={engagementChartData} label="Avg engagement rate (%)" />
            </Card>
          </div>
        )}

        {/* Top posts */}
        {!loading && topPosts && topPosts.length > 0 && (
          <Card title="Top Performing Posts">
            <div className="divide-y divide-white/[0.04]">
              {topPosts.map((post) => (
                <div key={post.post_id} className="py-4 flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-200 truncate">
                      {post.title ?? post.body.slice(0, 60) + (post.body.length > 60 ? "…" : "")}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium text-white ${PLATFORM_COLORS[post.platform] ?? "bg-slate-500"}`}
                      >
                        {PLATFORM_LABELS[post.platform] ?? post.platform}
                      </span>
                      <span className="text-xs text-slate-500">
                        {post.impressions.toLocaleString()} impressions · {post.likes.toLocaleString()} likes
                      </span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-semibold text-emerald-400">
                      {post.engagement_rate}%
                    </div>
                    <div className="text-xs text-slate-500">engagement</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </PageShell>
  );
}
