"use client";

import { Pill } from "@/src/components/ui";
import { formatEventDateLong, formatEventTime } from "@/src/lib/format";
import type { CalendarEvent } from "@/src/lib/types/workspace";

const RESPONSE_ICONS: Record<string, { icon: string; color: string }> = {
  accepted: { icon: "✓", color: "text-emerald-400" },
  organizer: { icon: "✓", color: "text-emerald-400" },
  tentativelyAccepted: { icon: "?", color: "text-amber-400" },
  declined: { icon: "✗", color: "text-red-400" },
  notResponded: { icon: "○", color: "text-slate-500" },
  none: { icon: "○", color: "text-slate-500" },
};

export function EventDetailDrawer({
  event,
  onClose,
}: {
  event: CalendarEvent | null;
  onClose: () => void;
}) {
  if (!event) return null;

  const attendees = event.attendees ?? [];

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 z-30" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed right-0 top-0 w-96 h-full bg-elevated border-l border-white/[0.08] p-6 overflow-y-auto z-40">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-200 transition-colors"
        >
          ✕
        </button>

        {/* Subject */}
        <h2 className={["text-xl font-semibold text-slate-100 pr-8", event.is_cancelled ? "line-through" : ""].join(" ")}>
          {event.subject || "(no title)"}
        </h2>

        {/* Date & time */}
        <div className="mt-3 space-y-1">
          <p className="text-sm text-slate-300">{formatEventDateLong(event.start_at)}</p>
          <p className="text-sm text-slate-400">
            {event.is_all_day
              ? "All day"
              : `${formatEventTime(event.start_at)} – ${formatEventTime(event.end_at)}`}
          </p>
        </div>

        {/* Status pills */}
        <div className="flex flex-wrap gap-1.5 mt-3">
          {event.show_as && <Pill>{event.show_as}</Pill>}
          {event.is_cancelled && <Pill>Cancelled</Pill>}
          {event.is_recurring && <Pill>Recurring</Pill>}
          {event.importance && event.importance !== "normal" && <Pill>{event.importance}</Pill>}
        </div>

        {/* Location */}
        {event.location && (
          <div className="mt-4">
            <p className="text-xs text-slate-500 mb-1">Location</p>
            <p className="text-sm text-slate-300">📍 {event.location}</p>
          </div>
        )}

        {/* Online meeting */}
        {event.online_meeting_url && (
          <div className="mt-3">
            <a
              href={event.online_meeting_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-500 transition-colors"
            >
              Join meeting
            </a>
            {event.online_meeting_provider && (
              <span className="ml-2 text-xs text-slate-500">{event.online_meeting_provider}</span>
            )}
          </div>
        )}

        {/* Organizer */}
        {(event.organizer_name || event.organizer_email) && (
          <div className="mt-4">
            <p className="text-xs text-slate-500 mb-1">Organizer</p>
            <p className="text-sm text-slate-300">
              {event.organizer_name ?? ""}
              {event.organizer_email && (
                <span className="text-slate-500"> &lt;{event.organizer_email}&gt;</span>
              )}
            </p>
          </div>
        )}

        {/* Attendees */}
        {attendees.length > 0 && (
          <div className="mt-4">
            <p className="text-xs text-slate-500 mb-2">Attendees ({attendees.length})</p>
            <div className="space-y-1">
              {attendees.map((att, i) => {
                const response = att.status?.response ?? "none";
                const ri = RESPONSE_ICONS[response] ?? RESPONSE_ICONS.none;
                return (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <span className={`text-xs ${ri.color}`}>{ri.icon}</span>
                    <span className="text-slate-300 truncate">
                      {att.emailAddress?.name || att.emailAddress?.address || "Unknown"}
                    </span>
                    {att.type === "optional" && (
                      <span className="text-[10px] text-slate-600">optional</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Body */}
        {(event.body_html || event.body_text || event.body_preview) && (
          <div className="mt-4">
            <p className="text-xs text-slate-500 mb-2">Details</p>
            {event.body_html ? (
              <iframe
                srcDoc={event.body_html}
                sandbox=""
                className="w-full min-h-40 border border-white/[0.06] rounded bg-white"
              />
            ) : (
              <pre className="whitespace-pre-wrap text-sm font-sans text-slate-300">
                {event.body_text || event.body_preview}
              </pre>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="mt-6 pt-4 border-t border-white/[0.06]">
          <a
            href="https://outlook.live.com/calendar/view/week"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-slate-400 hover:text-slate-200 transition-colors"
          >
            Open in Outlook
          </a>
        </div>
      </div>
    </>
  );
}
