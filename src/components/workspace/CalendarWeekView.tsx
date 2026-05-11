"use client";

import { useMemo } from "react";
import { addDays } from "@/src/lib/format";
import { CalendarEventBlock } from "@/src/components/workspace/CalendarEventBlock";
import type { CalendarEvent } from "@/src/lib/types/workspace";

const DAY_START_HOUR = 6;
const DAY_END_HOUR = 23;
const HOURS_IN_VIEW = DAY_END_HOUR - DAY_START_HOUR;
const HOUR_LABELS = Array.from({ length: HOURS_IN_VIEW }, (_, i) => {
  const h = DAY_START_HOUR + i;
  if (h === 0) return "12 AM";
  if (h < 12) return `${h} AM`;
  if (h === 12) return "12 PM";
  return `${h - 12} PM`;
});

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function getEventsForDay(events: CalendarEvent[], dayDate: Date, allDay: boolean): CalendarEvent[] {
  return events.filter((e) => {
    const s = new Date(e.start_at);
    return isSameDay(s, dayDate) && e.is_all_day === allDay;
  });
}

function getEventPosition(event: CalendarEvent) {
  const eventStart = new Date(event.start_at);
  const eventEnd = new Date(event.end_at);
  const startMinutes = eventStart.getHours() * 60 + eventStart.getMinutes() - DAY_START_HOUR * 60;
  const endMinutes = eventEnd.getHours() * 60 + eventEnd.getMinutes() - DAY_START_HOUR * 60;
  const totalMinutes = HOURS_IN_VIEW * 60;
  const topPercent = Math.max(0, (startMinutes / totalMinutes) * 100);
  const heightPercent = Math.max(2, ((endMinutes - startMinutes) / totalMinutes) * 100);
  return { topPercent, heightPercent };
}

export function CalendarWeekView({
  weekStart,
  events,
  selectedEventId,
  onEventClick,
}: {
  weekStart: Date;
  events: CalendarEvent[];
  selectedEventId: string | null;
  onEventClick: (event: CalendarEvent) => void;
}) {
  const today = useMemo(() => new Date(), []);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  return (
    <div className="flex flex-col h-full">
      {/* All-day events row */}
      <div className="flex border-b border-white/[0.06]">
        <div className="w-14 shrink-0" />
        {days.map((day, i) => {
          const allDayEvents = getEventsForDay(events, day, true);
          return (
            <div key={i} className="flex-1 min-w-0 px-1 py-1 border-l border-white/[0.04]">
              {allDayEvents.map((e) => (
                <button
                  key={e.id}
                  onClick={() => onEventClick(e)}
                  className={[
                    "w-full text-left text-[10px] px-1.5 py-0.5 rounded truncate mb-0.5 transition-colors",
                    "bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30",
                    selectedEventId === e.id ? "ring-1 ring-emerald-400" : "",
                    e.is_cancelled ? "line-through opacity-50" : "",
                  ].join(" ")}
                >
                  {e.subject || "(no title)"}
                </button>
              ))}
            </div>
          );
        })}
      </div>

      {/* Day headers */}
      <div className="flex border-b border-white/[0.06]">
        <div className="w-14 shrink-0" />
        {days.map((day, i) => {
          const isToday = isSameDay(day, today);
          return (
            <div
              key={i}
              className={[
                "flex-1 text-center py-2 text-xs border-l border-white/[0.04]",
                isToday ? "text-emerald-400 font-semibold" : "text-slate-400",
              ].join(" ")}
            >
              <div>{DAY_NAMES[day.getDay()]}</div>
              <div className={["text-lg font-semibold", isToday ? "text-emerald-400" : "text-slate-200"].join(" ")}>
                {day.getDate()}
              </div>
              {isToday && <div className="text-[10px] text-emerald-500">Today</div>}
            </div>
          );
        })}
      </div>

      {/* Hour grid */}
      <div className="flex-1 overflow-y-auto">
        <div className="flex" style={{ minHeight: `${HOURS_IN_VIEW * 60}px` }}>
          {/* Time column */}
          <div className="w-14 shrink-0">
            {HOUR_LABELS.map((label, i) => (
              <div
                key={i}
                className="text-[10px] text-slate-500 text-right pr-2 border-b border-white/[0.04]"
                style={{ height: "60px" }}
              >
                {label}
              </div>
            ))}
          </div>

          {/* Day columns */}
          {days.map((day, dayIdx) => {
            const dayEvents = getEventsForDay(events, day, false);
            const isToday = isSameDay(day, today);
            return (
              <div
                key={dayIdx}
                className={[
                  "flex-1 relative border-l border-white/[0.04]",
                  isToday ? "bg-emerald-500/5" : "",
                ].join(" ")}
              >
                {/* Hour grid lines */}
                {HOUR_LABELS.map((_, i) => (
                  <div key={i} className="border-b border-white/[0.04]" style={{ height: "60px" }} />
                ))}

                {/* Event blocks */}
                {dayEvents.map((event) => {
                  const { topPercent, heightPercent } = getEventPosition(event);
                  return (
                    <CalendarEventBlock
                      key={event.id}
                      event={event}
                      topPercent={topPercent}
                      heightPercent={heightPercent}
                      onClick={() => onEventClick(event)}
                      isSelected={selectedEventId === event.id}
                    />
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
