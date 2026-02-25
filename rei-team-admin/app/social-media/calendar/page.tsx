"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PageShell } from "@/src/components/PageShell";
import { Button, Tabs } from "@/src/components/ui";
import { CalendarGrid } from "@/src/components/social-media/calendar/CalendarGrid";
import { ScheduleList } from "@/src/components/social-media/calendar/ScheduleList";
import { SchedulePostModal } from "@/src/components/social-media/calendar/SchedulePostModal";
import { ReschedulePostModal } from "@/src/components/social-media/calendar/ReschedulePostModal";
import type { CalendarEvent, PlatformName, PostStatus, ScheduleType } from "@/src/lib/types/social-media";
import { ALL_PLATFORMS } from "@/src/components/social-media/platform-config";

// ── Helpers ──────────────────────────────────────────────────────────────────

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addMonths(d: Date, n: number): Date {
  const r = new Date(d);
  r.setMonth(r.getMonth() + n);
  r.setDate(1);
  return r;
}

function addWeeks(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n * 7);
  return r;
}

function monthLabel(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function weekLabel(d: Date): string {
  const end = new Date(d);
  end.setDate(end.getDate() + 6);
  return `${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
}

const STATUS_OPTIONS: PostStatus[] = ["scheduled", "published", "approved", "pending_approval", "draft"];
const SCHEDULE_TYPE_OPTIONS: Array<{ value: ScheduleType | ""; label: string }> = [
  { value: "", label: "All types" },
  { value: "one_time", label: "One-time" },
  { value: "recurring", label: "Recurring" },
];

// ── Page ─────────────────────────────────────────────────────────────────────

export default function SocialMediaCalendarPage() {
  const router = useRouter();

  const [calMode, setCalMode] = useState<"month" | "week">("month");
  const [viewStart, setViewStart] = useState<Date>(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });

  // Filters
  const [selectedPlatforms, setSelectedPlatforms] = useState<Set<PlatformName>>(new Set());
  const [selectedStatuses, setSelectedStatuses] = useState<Set<PostStatus>>(new Set());
  const [scheduleTypeFilter, setScheduleTypeFilter] = useState<ScheduleType | "">("");

  // Data
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Modal state
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [rescheduleEvent, setRescheduleEvent] = useState<CalendarEvent | null>(null);
  const [selectedDayEvents, setSelectedDayEvents] = useState<CalendarEvent[] | null>(null);

  // Fetch events
  const fetchEvents = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      // Date range for current view
      const dateFrom = isoDate(viewStart);
      let dateTo: string;
      if (calMode === "month") {
        const end = new Date(viewStart.getFullYear(), viewStart.getMonth() + 1, 0);
        dateTo = isoDate(end);
      } else {
        const end = new Date(viewStart);
        end.setDate(end.getDate() + 6);
        dateTo = isoDate(end);
      }
      params.set("date_from", dateFrom);
      params.set("date_to", dateTo);
      if (selectedPlatforms.size) params.set("platforms", Array.from(selectedPlatforms).join(","));
      if (selectedStatuses.size) params.set("statuses", Array.from(selectedStatuses).join(","));
      if (scheduleTypeFilter) params.set("schedule_type", scheduleTypeFilter);

      const res = await fetch(`/api/calendar?${params}`);
      if (!res.ok) throw new Error("Failed to load calendar events.");
      setEvents(await res.json());
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [viewStart, calMode, selectedPlatforms, selectedStatuses, scheduleTypeFilter]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  // Navigation
  const navigate = (dir: 1 | -1) => {
    if (calMode === "month") setViewStart((d) => addMonths(d, dir));
    else setViewStart((d) => addWeeks(d, dir));
  };

  const goToday = () => {
    const d = new Date();
    if (calMode === "month") { d.setDate(1); }
    setViewStart(d);
  };

  const togglePlatform = (p: PlatformName) => {
    setSelectedPlatforms((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p); else next.add(p);
      return next;
    });
  };

  const toggleStatus = (s: PostStatus) => {
    setSelectedStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s); else next.add(s);
      return next;
    });
  };

  const handleSelectEvent = (ev: CalendarEvent) => {
    setRescheduleEvent(ev);
  };

  const handleSelectDay = (date: Date) => {
    const dateStr = isoDate(date);
    const dayEvents = events.filter((ev) => ev.scheduled_at?.slice(0, 10) === dateStr);
    setSelectedDayEvents(dayEvents.length > 0 ? dayEvents : null);
  };

  const viewLabel = calMode === "month" ? monthLabel(viewStart) : weekLabel(viewStart);

  return (
    <PageShell>
      <div className="space-y-5 max-w-7xl">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold text-slate-100">Content Calendar</h1>
            <p className="text-sm text-slate-400 mt-0.5">
              Visualize and manage your scheduled content across all platforms.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => router.push("/social-media/library")}>
              Content Library
            </Button>
            <Button onClick={() => setScheduleModalOpen(true)}>+ Schedule Post</Button>
          </div>
        </div>

        {/* Controls row */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Month / Week toggle */}
          <Tabs
            tabs={[
              { value: "month", label: "Month" },
              { value: "week", label: "Week" },
            ]}
            value={calMode}
            onChange={(v) => setCalMode(v as "month" | "week")}
          />

          {/* Navigation */}
          <div className="flex items-center gap-1">
            <Button variant="ghost" onClick={() => navigate(-1)} className="px-2">‹</Button>
            <Button variant="ghost" onClick={goToday} className="text-xs">Today</Button>
            <Button variant="ghost" onClick={() => navigate(1)} className="px-2">›</Button>
          </div>

          <span className="text-sm font-medium text-slate-300">{viewLabel}</span>
        </div>

        {/* Filter row */}
        <div className="flex items-start gap-4 flex-wrap text-xs">
          {/* Platform filter */}
          <div>
            <p className="text-slate-500 mb-1 font-medium">Platforms</p>
            <div className="flex flex-wrap gap-1">
              {ALL_PLATFORMS.map((p) => (
                <button
                  key={p}
                  onClick={() => togglePlatform(p)}
                  className={[
                    "rounded-full border px-2 py-0.5 capitalize transition-colors",
                    selectedPlatforms.has(p)
                      ? "border-emerald-500/50 bg-emerald-900/30 text-emerald-300"
                      : "border-white/10 text-slate-400 hover:border-white/20",
                  ].join(" ")}
                >
                  {p.replace("_", " ")}
                </button>
              ))}
            </div>
          </div>

          {/* Status filter */}
          <div>
            <p className="text-slate-500 mb-1 font-medium">Status</p>
            <div className="flex flex-wrap gap-1">
              {STATUS_OPTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => toggleStatus(s)}
                  className={[
                    "rounded-full border px-2 py-0.5 capitalize transition-colors",
                    selectedStatuses.has(s)
                      ? "border-blue-500/50 bg-blue-900/30 text-blue-300"
                      : "border-white/10 text-slate-400 hover:border-white/20",
                  ].join(" ")}
                >
                  {s.replace(/_/g, " ")}
                </button>
              ))}
            </div>
          </div>

          {/* Schedule type filter */}
          <div>
            <p className="text-slate-500 mb-1 font-medium">Type</p>
            <div className="flex gap-1">
              {SCHEDULE_TYPE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setScheduleTypeFilter(opt.value)}
                  className={[
                    "rounded-full border px-2 py-0.5 transition-colors",
                    scheduleTypeFilter === opt.value
                      ? "border-emerald-500/50 bg-emerald-900/30 text-emerald-300"
                      : "border-white/10 text-slate-400 hover:border-white/20",
                  ].join(" ")}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Clear filters */}
          {(selectedPlatforms.size > 0 || selectedStatuses.size > 0 || scheduleTypeFilter) && (
            <button
              onClick={() => {
                setSelectedPlatforms(new Set());
                setSelectedStatuses(new Set());
                setScheduleTypeFilter("");
              }}
              className="text-slate-500 hover:text-slate-300 underline self-end pb-0.5"
            >
              Clear filters
            </button>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-xl bg-red-900/20 border border-red-800/40 px-4 py-4">
            <p className="text-sm text-red-400">{error}</p>
            <Button variant="ghost" onClick={fetchEvents} className="mt-2 text-xs">
              Retry
            </Button>
          </div>
        )}

        {/* Overdue posts banner — shown when scheduled posts are past their run time */}
        {!loading && !error && (() => {
          const now = new Date();
          const overdueCount = events.filter(
            (ev) =>
              ev.post_status === "scheduled" &&
              ev.next_run_at != null &&
              new Date(ev.next_run_at) < now
          ).length;
          if (!overdueCount) return null;
          return (
            <div className="rounded-xl bg-amber-900/20 border border-amber-700/40 px-4 py-3 flex items-center gap-3">
              <span className="text-amber-400 text-base">⚠</span>
              <p className="text-sm text-amber-300 flex-1">
                {overdueCount} scheduled post{overdueCount > 1 ? "s are" : " is"} overdue — the
                cron engine will publish them on its next run (every 5 minutes).
              </p>
              <Button variant="ghost" onClick={fetchEvents} className="text-xs shrink-0">
                Refresh
              </Button>
            </div>
          );
        })()}

        {/* Loading skeleton */}
        {loading && (
          <div className="rounded-2xl border border-white/[0.06] bg-surface h-96 animate-pulse" />
        )}

        {/* Calendar Grid */}
        {!loading && !error && (
          <div className="flex gap-4">
            <div className="flex-1 min-w-0">
              <CalendarGrid
                viewStart={viewStart}
                mode={calMode}
                events={events}
                onSelectEvent={handleSelectEvent}
                onSelectDay={handleSelectDay}
              />
            </div>

            {/* Day detail sidebar (shown when a day with events is clicked) */}
            {selectedDayEvents && (
              <div className="w-64 shrink-0 rounded-2xl border border-white/[0.06] bg-surface p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-slate-200">Day Events</h3>
                  <button
                    onClick={() => setSelectedDayEvents(null)}
                    className="text-xs text-slate-500 hover:text-slate-300"
                  >
                    ✕
                  </button>
                </div>
                <ScheduleList events={selectedDayEvents} onSelect={handleSelectEvent} />
              </div>
            )}
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && events.length === 0 && (
          <div className="rounded-xl border border-white/[0.06] bg-surface px-4 py-12 text-center">
            <p className="text-slate-400 text-sm">No scheduled posts in this period.</p>
            <p className="text-slate-500 text-xs mt-1">
              Schedule a post or adjust your filters.
            </p>
            <Button onClick={() => setScheduleModalOpen(true)} className="mt-4">
              Schedule a Post
            </Button>
          </div>
        )}
      </div>

      {/* Schedule Post Modal (post picker placeholder — navigates to library) */}
      <SchedulePostModal
        open={scheduleModalOpen}
        post={null}
        onClose={() => setScheduleModalOpen(false)}
        onScheduled={fetchEvents}
      />

      {/* Reschedule / detail modal */}
      <ReschedulePostModal
        open={rescheduleEvent !== null}
        event={rescheduleEvent}
        onClose={() => setRescheduleEvent(null)}
        onRescheduled={() => {
          setRescheduleEvent(null);
          fetchEvents();
        }}
      />
    </PageShell>
  );
}
