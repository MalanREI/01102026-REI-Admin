"use client";
import { useMemo } from "react";
import type { CalendarEvent } from "@/src/lib/types/social-media";
import { ScheduleList } from "./ScheduleList";

interface CalendarGridProps {
  /** ISO date string for the first day of the visible range (YYYY-MM-DD). */
  viewStart: Date;
  /** 'month' shows a full month grid; 'week' shows 7 days. */
  mode: "month" | "week";
  events: CalendarEvent[];
  onSelectEvent: (event: CalendarEvent) => void;
  /** Called when the user clicks an empty day to schedule a new post. */
  onSelectDay?: (date: Date) => void;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function startOfWeek(d: Date): Date {
  const day = d.getDay(); // 0 = Sunday
  return addDays(d, -day);
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Monthly/weekly calendar grid that renders scheduled events per day cell.
 */
export function CalendarGrid({
  viewStart,
  mode,
  events,
  onSelectEvent,
  onSelectDay,
}: CalendarGridProps) {
  // Build the array of cells (dates) to display
  const cells = useMemo<Date[]>(() => {
    if (mode === "week") {
      const start = startOfWeek(viewStart);
      return Array.from({ length: 7 }, (_, i) => addDays(start, i));
    }
    // Month mode: start from the Sunday of the week containing the 1st
    const monthStart = startOfMonth(viewStart);
    const gridStart = startOfWeek(monthStart);
    // Always show 6 weeks (42 cells) for a stable layout
    return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  }, [viewStart, mode]);

  // Index events by date string
  const eventsByDate = useMemo<Record<string, CalendarEvent[]>>(() => {
    const map: Record<string, CalendarEvent[]> = {};
    for (const ev of events) {
      if (!ev.scheduled_at) continue;
      const key = ev.scheduled_at.slice(0, 10);
      if (!map[key]) map[key] = [];
      map[key].push(ev);
    }
    return map;
  }, [events]);

  const todayStr = isoDate(new Date());
  const viewMonthNum = viewStart.getMonth();

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-surface overflow-hidden">
      {/* Day-of-week header */}
      <div className="grid grid-cols-7 border-b border-white/[0.06]">
        {DAY_LABELS.map((d) => (
          <div
            key={d}
            className="px-2 py-2 text-center text-xs font-medium text-slate-500 uppercase tracking-wide"
          >
            {d}
          </div>
        ))}
      </div>

      {/* Calendar cells */}
      <div className={`grid grid-cols-7 ${mode === "month" ? "grid-rows-6" : "grid-rows-1"}`}>
        {cells.map((date) => {
          const dateStr = isoDate(date);
          const dayEvents = eventsByDate[dateStr] ?? [];
          const isToday = dateStr === todayStr;
          const isOtherMonth = mode === "month" && date.getMonth() !== viewMonthNum;

          return (
            <div
              key={dateStr}
              onClick={() => onSelectDay?.(date)}
              className={[
                "min-h-[100px] p-1.5 border-r border-b border-white/[0.06] last:border-r-0 cursor-pointer",
                isOtherMonth ? "opacity-40" : "",
                isToday ? "bg-emerald-900/10" : "hover:bg-white/[0.02]",
                "transition-colors",
              ].join(" ")}
            >
              {/* Day number */}
              <div className="mb-1 flex items-center justify-between">
                <span
                  className={[
                    "text-xs font-semibold px-1 py-0.5 rounded-full w-6 h-6 flex items-center justify-center",
                    isToday
                      ? "bg-emerald-500 text-white"
                      : "text-slate-400",
                  ].join(" ")}
                >
                  {date.getDate()}
                </span>
                {dayEvents.length > 0 && (
                  <span className="text-[10px] text-slate-500">{dayEvents.length}</span>
                )}
              </div>

              {/* Events: show up to 3, then "+N more" */}
              <div onClick={(e) => e.stopPropagation()}>
                <ScheduleList
                  events={dayEvents.slice(0, 3)}
                  onSelect={onSelectEvent}
                />
                {dayEvents.length > 3 && (
                  <p className="text-[10px] text-slate-500 mt-1 pl-1">
                    +{dayEvents.length - 3} more
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
