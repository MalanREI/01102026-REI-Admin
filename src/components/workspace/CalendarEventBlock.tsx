"use client";

import { formatEventTime } from "@/src/lib/format";
import type { CalendarEvent } from "@/src/lib/types/workspace";

const SHOW_AS_STYLES: Record<string, string> = {
  busy: "bg-emerald-500/30 border-l-2 border-emerald-500 text-emerald-100",
  tentative: "bg-amber-500/20 border-l-2 border-amber-500 text-amber-100",
  free: "bg-slate-500/20 border-l-2 border-slate-500 text-slate-300",
  oof: "bg-purple-500/20 border-l-2 border-purple-500 text-purple-100",
  workingElsewhere: "bg-blue-500/20 border-l-2 border-blue-500 text-blue-100",
};

export function CalendarEventBlock({
  event,
  topPercent,
  heightPercent,
  onClick,
  isSelected,
}: {
  event: CalendarEvent;
  topPercent: number;
  heightPercent: number;
  onClick: () => void;
  isSelected: boolean;
}) {
  const colorClass = SHOW_AS_STYLES[event.show_as ?? "busy"] ?? SHOW_AS_STYLES.busy;

  return (
    <button
      type="button"
      style={{ top: `${topPercent}%`, height: `${Math.max(heightPercent, 2)}%` }}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={[
        "absolute left-1 right-1 px-2 py-0.5 rounded text-xs text-left overflow-hidden cursor-pointer transition-all",
        colorClass,
        event.is_cancelled ? "line-through opacity-50" : "",
        isSelected ? "ring-2 ring-emerald-400" : "",
        "hover:brightness-125",
      ].join(" ")}
    >
      <div className="font-medium truncate">{event.subject || "(no title)"}</div>
      <div className="text-[10px] opacity-80 truncate">
        {formatEventTime(event.start_at)} – {formatEventTime(event.end_at)}
      </div>
      {event.location && (
        <div className="text-[10px] opacity-70 truncate">📍 {event.location}</div>
      )}
    </button>
  );
}
