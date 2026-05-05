"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PageShell } from "@/src/components/PageShell";
import { supabaseBrowser } from "@/src/lib/supabase/browser";

export const dynamic = "force-dynamic";

// ─── Types ─────────────────────────────────────────────────────────────────────

type DashboardStats = {
  leads: number;
  postsScheduled: number;
  postsThisWeek: number;
};

// ─── Mock Data ─────────────────────────────────────────────────────────────────
// TODO: Replace each block with real Supabase queries when tables are available.

const MOCK_ACTIVITY = [
  { id: "1", icon: "👤", description: "New lead added: Sarah Johnson", time: "2 hours ago" },
  { id: "2", icon: "📅", description: "Meeting notes sent to follow-up queue", time: "4 hours ago" },
  { id: "3", icon: "📱", description: "Instagram post published", time: "6 hours ago" },
  { id: "4", icon: "✅", description: "Lead moved to Proposal stage", time: "Yesterday" },
  { id: "5", icon: "📝", description: "Content post scheduled for Friday", time: "Yesterday" },
];

const MOCK_MEETINGS = [
  { id: "1", title: "Buyer Consultation – Martinez Family", date: "Today", time: "2:00 PM", attendees: 3 },
  { id: "2", title: "Listing Presentation – Oak Ave Property", date: "Tomorrow", time: "10:00 AM", attendees: 2 },
  { id: "3", title: "Team Sync", date: "Thu, Mar 14", time: "9:00 AM", attendees: 5 },
];

// TODO: Replace with real funnel stage data from sales_funnel / leads table
const FUNNEL_STAGES = [
  { label: "New Lead", count: 24, color: "bg-blue-500" },
  { label: "Contacted", count: 18, color: "bg-indigo-500" },
  { label: "Meeting Scheduled", count: 12, color: "bg-violet-500" },
  { label: "Proposal", count: 7, color: "bg-emerald-500" },
  { label: "Closed", count: 4, color: "bg-amber-500" },
];

// TODO: Replace with real analytics snapshot from analytics table
const MOCK_POSTS_BY_DAY = [2, 0, 1, 1, 1, 0, 0]; // Mon–Sun

// ─── Helpers ───────────────────────────────────────────────────────────────────

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function formatDate(d: Date) {
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function HomePage() {
  const sb = useMemo(() => supabaseBrowser(), []);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [userName, setUserName] = useState("Alan");
  const [error, setError] = useState<string | null>(null);

  // Greeting + date
  const greeting = useMemo(() => getGreeting(), []);
  const today = useMemo(() => formatDate(new Date()), []);
  const maxFunnel = Math.max(...FUNNEL_STAGES.map((s) => s.count));

  // Load user display name from auth email
  useEffect(() => {
    sb.auth.getUser().then(({ data }) => {
      const email = data.user?.email ?? "";
      const part = email.split("@")[0];
      if (part) setUserName(part.charAt(0).toUpperCase() + part.slice(1));
    });
  }, [sb]);

  // Load real stats
  useEffect(() => {
    const run = async () => {
      setLoadingStats(true);
      try {
        const now = new Date();
        const day = now.getDay();
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
        startOfWeek.setHours(0, 0, 0, 0);

        const [leadsRes, scheduledRes, weekPostsRes] = await Promise.all([
          sb.from("leads").select("id", { count: "exact", head: true }),
          sb.from("content_posts").select("id", { count: "exact", head: true }).eq("status", "scheduled"),
          sb.from("content_posts")
            .select("id", { count: "exact", head: true })
            .gte("created_at", startOfWeek.toISOString()),
        ]);

        setStats({
          leads: leadsRes.count ?? 0,
          postsScheduled: scheduledRes.count ?? 0,
          postsThisWeek: weekPostsRes.count ?? 0,
        });
      } catch (e: unknown) {
        setError((e as Error)?.message ?? "Failed to load dashboard data");
      } finally {
        setLoadingStats(false);
      }
    };
    void run();
  }, [sb]);

  return (
    <PageShell>
      <div className="max-w-7xl space-y-5">

        {error && (
          <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-3">
            {error}
          </div>
        )}

        {/* ── 1. Welcome Header ───────────────────────────────────────────── */}
        <div className="rounded-xl border border-white/[0.06] bg-surface p-6 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex-1">
            <h1 className="text-2xl font-semibold">
              {greeting}, {userName} 👋
            </h1>
            <p className="text-slate-400 text-sm mt-1">{today}</p>
            <p className="text-slate-500 text-sm mt-1">
              {/* TODO: replace counts with real meeting + post queries */}
              You have 3 meetings this week and{" "}
              {loadingStats ? "…" : stats?.postsScheduled ?? 0} posts scheduled.
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <HeaderQuickAction href="/meetings" icon="📅" label="New Meeting" />
            <HeaderQuickAction href="/social-media/content-studio" icon="✏️" label="Create Post" />
            <HeaderQuickAction href="/sales-funnel" icon="👤" label="Add Lead" />
          </div>
        </div>

        {/* ── 2. KPI Cards ────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            icon="👥"
            label="Total Leads"
            value={loadingStats ? "—" : String(stats?.leads ?? 0)}
            trend="up"
            trendLabel="12% this month" // TODO: compute from historical leads data
          />
          <KpiCard
            icon="📅"
            label="Meetings This Week"
            value="3" // TODO: wire from real meetings / kanban_cards table
            trend="up"
            trendLabel="+1 vs last week"
          />
          <KpiCard
            icon="📱"
            label="Posts Scheduled"
            value={loadingStats ? "—" : String(stats?.postsScheduled ?? 0)}
            trend="up"
            trendLabel="On track"
          />
          <KpiCard
            icon="📊"
            label="Conversion Rate"
            value="16.7%" // TODO: compute closed / new leads from funnel data
            trend="down"
            trendLabel="↓ 2% vs last month"
          />
        </div>

        {/* ── 3. Activity Feed + Upcoming Meetings ─────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* Activity Feed */}
          <SectionCard title="Recent Activity">
            {/* MOCK DATA – replace with real activity_log query */}
            <div className="space-y-1">
              {MOCK_ACTIVITY.map((item) => (
                <div
                  key={item.id}
                  className="flex items-start gap-3 py-2.5 border-b border-white/[0.04] last:border-0"
                >
                  <span className="text-lg shrink-0 mt-0.5">{item.icon}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-slate-200">{item.description}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{item.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>

          {/* Upcoming Meetings */}
          <SectionCard
            title="Upcoming Meetings"
            action={<Link href="/meetings" className="text-xs text-emerald-400 hover:text-emerald-300">View all →</Link>}
          >
            {/* MOCK DATA – replace with real meetings query ordered by date */}
            <div className="space-y-2">
              {MOCK_MEETINGS.map((m) => (
                <Link
                  key={m.id}
                  href={`/meetings/${m.id}`}
                  className="flex items-center gap-3 rounded-lg border border-white/[0.04] bg-white/[0.02] hover:bg-white/[0.05] p-3 transition-colors"
                >
                  <div className="shrink-0 w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center text-lg">
                    📅
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-slate-200 truncate">{m.title}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{m.date} · {m.time}</p>
                  </div>
                  <p className="text-xs text-slate-500 shrink-0">{m.attendees} ppl</p>
                </Link>
              ))}
            </div>
          </SectionCard>

        </div>

        {/* ── 4. Sales Funnel + Social Media Snapshot ──────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* Sales Funnel */}
          <SectionCard
            title="Sales Funnel"
            action={<Link href="/sales-funnel" className="text-xs text-emerald-400 hover:text-emerald-300">View full →</Link>}
          >
            {/* MOCK DATA – replace with real funnel stage counts from leads table */}
            <div className="space-y-3">
              {FUNNEL_STAGES.map((stage) => (
                <div key={stage.label}>
                  <div className="flex justify-between text-xs text-slate-400 mb-1">
                    <span>{stage.label}</span>
                    <span className="font-medium text-slate-300">{stage.count}</span>
                  </div>
                  <div className="h-2 bg-white/[0.06] rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${stage.color} transition-all duration-500`}
                      style={{ width: `${(stage.count / maxFunnel) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>

          {/* Social Media Snapshot */}
          <SectionCard
            title="Social Media"
            action={<Link href="/social-media" className="text-xs text-emerald-400 hover:text-emerald-300">View full →</Link>}
          >
            <div className="grid grid-cols-3 gap-3 mb-5">
              <MiniStat
                label="Posts This Week"
                value={loadingStats ? "—" : String(stats?.postsThisWeek ?? 0)}
              />
              <MiniStat label="Engagement Rate" value="3.2%" note="MOCK" /> {/* TODO: wire from analytics */}
              <MiniStat label="Platforms" value="3" note="MOCK" />           {/* TODO: wire from social_platforms */}
            </div>
            <p className="text-xs text-slate-500 mb-2">Posts this week (Mon–Sun)</p>
            {/* MOCK DATA – replace with real posts-per-day query */}
            <MiniBarChart data={MOCK_POSTS_BY_DAY} labels={["M", "T", "W", "T", "F", "S", "S"]} />
          </SectionCard>

        </div>

        {/* ── 5. Quick Actions ─────────────────────────────────────────────── */}
        <SectionCard title="Quick Actions">
          <div className="flex flex-wrap gap-3">
            <ActionButton href="/meetings" icon="📅" label="New Meeting" />
            <ActionButton href="/social-media/content-studio" icon="✏️" label="Create Post" />
            <ActionButton href="/sales-funnel" icon="👤" label="Add Lead" />
            <ActionButton href="/social-media/calendar" icon="📆" label="View Calendar" />
          </div>
        </SectionCard>

      </div>
    </PageShell>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function SectionCard({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-surface p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-medium text-slate-300">{title}</h2>
        {action}
      </div>
      {children}
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  trend,
  trendLabel,
}: {
  icon: string;
  label: string;
  value: string;
  trend: "up" | "down";
  trendLabel: string;
}) {
  const isUp = trend === "up";
  return (
    <div className="rounded-xl border border-white/[0.06] bg-surface p-5 hover:bg-white/[0.03] transition-colors">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xl">{icon}</span>
        <span className={`text-xs font-medium ${isUp ? "text-emerald-400" : "text-red-400"}`}>
          {isUp ? "↑" : "↓"}
        </span>
      </div>
      <p className="text-3xl font-semibold">{value}</p>
      <p className="text-xs text-slate-500 mt-1">{label}</p>
      <p className={`text-xs mt-1 ${isUp ? "text-emerald-400/70" : "text-red-400/70"}`}>{trendLabel}</p>
    </div>
  );
}

function MiniStat({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-3 text-center">
      <p className="text-2xl font-semibold">{value}</p>
      <p className="text-xs text-slate-500 mt-1">{label}</p>
      {note && <p className="text-[10px] text-slate-600 mt-0.5">{note}</p>}
    </div>
  );
}

function MiniBarChart({ data, labels }: { data: number[]; labels: string[] }) {
  const max = Math.max(...data, 1);
  return (
    <div className="flex items-end gap-1 h-14">
      {data.map((v, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1">
          <div className="w-full flex items-end" style={{ height: "40px" }}>
            <div
              className="w-full rounded-sm bg-emerald-500/40 hover:bg-emerald-500/60 transition-colors"
              style={{ height: v > 0 ? `${Math.max((v / max) * 100, 12)}%` : "0%" }}
            />
          </div>
          <span className="text-[10px] text-slate-500">{labels[i]}</span>
        </div>
      ))}
    </div>
  );
}

function HeaderQuickAction({ href, icon, label }: { href: string; icon: string; label: string }) {
  return (
    <Link
      href={href as never}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.09] border border-white/[0.08] text-sm text-slate-300 transition-colors"
    >
      <span>{icon}</span>
      {label}
    </Link>
  );
}

function ActionButton({ href, icon, label }: { href: string; icon: string; label: string }) {
  return (
    <Link
      href={href as never}
      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-white/[0.04] hover:bg-emerald-500/10 border border-white/[0.06] hover:border-emerald-500/20 text-sm text-slate-300 hover:text-emerald-400 transition-all"
    >
      <span className="text-base">{icon}</span>
      {label}
    </Link>
  );
}
