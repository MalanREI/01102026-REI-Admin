"use client";
import type { CalendarEvent } from "@/src/lib/types/social-media";
import { PostScheduleBadge } from "./PostScheduleBadge";
import { PLATFORM_CONFIGS } from "@/src/components/social-media/platform-config";

interface ScheduleListProps {
  /** Events for a single day. */
  events: CalendarEvent[];
  onSelect: (event: CalendarEvent) => void;
}

function formatTime(iso: string | null, timezone: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: timezone,
    });
  } catch {
    return new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  }
}

/**
 * A vertical list of scheduled events for a single day.
 * Used inside CalendarGrid day cells and as a sidebar detail view.
 */
export function ScheduleList({ events, onSelect }: ScheduleListProps) {
  if (events.length === 0) {
    return <p className="text-xs text-slate-500 italic">No scheduled posts.</p>;
  }

  return (
    <ul className="space-y-1.5">
      {events.map((ev) => {
        const time = formatTime(ev.scheduled_at, ev.timezone);
        const platformIcons = ev.target_platforms
          .map((p) => PLATFORM_CONFIGS[p as keyof typeof PLATFORM_CONFIGS]?.icon ?? p)
          .join(" ");

        return (
          <li key={ev.schedule_id}>
            <button
              onClick={() => onSelect(ev)}
              className="w-full text-left rounded-lg border border-white/[0.06] bg-white/[0.03] px-2.5 py-1.5 hover:bg-white/[0.07] transition-colors"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-slate-400 shrink-0">{time}</span>
                <PostScheduleBadge
                  status={ev.post_status}
                  scheduleType={ev.schedule_type}
                  nextRunAt={ev.next_run_at}
                />
              </div>
              <p className="text-xs text-slate-200 mt-0.5 truncate font-medium">
                {ev.post_title || ev.post_body.slice(0, 60)}
              </p>
              {platformIcons && (
                <p className="text-[11px] text-slate-500 mt-0.5">{platformIcons}</p>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
