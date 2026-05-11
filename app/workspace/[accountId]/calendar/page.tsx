"use client";

import { use, useCallback, useEffect, useState } from "react";
import { WorkspaceShell } from "@/src/components/workspace/WorkspaceShell";
import { useWorkspace } from "@/src/components/workspace/WorkspaceContext";
import { CalendarWeekView } from "@/src/components/workspace/CalendarWeekView";
import { EventDetailDrawer } from "@/src/components/workspace/EventDetailDrawer";
import { Button } from "@/src/components/ui";
import { listCalendarEvents } from "@/src/lib/supabase/workspace-queries";
import { getStartOfWeek, addDays, formatWeekRange } from "@/src/lib/format";
import type { CalendarEvent } from "@/src/lib/types/workspace";

function CalendarContent() {
  const { workspace, activeProjectId } = useWorkspace();
  const [weekStart, setWeekStart] = useState(() => getStartOfWeek(new Date()));
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const startDate = weekStart;
    const endDate = addDays(weekStart, 7);
    listCalendarEvents(workspace.id, {
      startDate,
      endDate,
      projectId: activeProjectId,
    })
      .then(setEvents)
      .catch((err) => {
        console.error("Failed to load calendar events:", err);
        setEvents([]);
      })
      .finally(() => setLoading(false));
  }, [workspace.id, weekStart, activeProjectId]);

  const handlePrev = useCallback(() => setWeekStart((w) => addDays(w, -7)), []);
  const handleNext = useCallback(() => setWeekStart((w) => addDays(w, 7)), []);
  const handleToday = useCallback(() => setWeekStart(getStartOfWeek(new Date())), []);

  return (
    <div className="flex flex-col h-[calc(100vh-160px)]">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4 mb-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={handlePrev}>← Prev</Button>
          <Button variant="ghost" onClick={handleToday}>Today</Button>
          <Button variant="ghost" onClick={handleNext}>Next →</Button>
        </div>
        <h2 className="text-sm font-semibold text-slate-200">{formatWeekRange(weekStart)}</h2>
        <div className="text-xs text-slate-500">
          {loading ? "Loading…" : `${events.length} event${events.length !== 1 ? "s" : ""}`}
        </div>
      </div>

      {/* Week grid */}
      <div className="flex-1 rounded-lg border border-white/[0.06] bg-surface overflow-hidden relative">
        <CalendarWeekView
          weekStart={weekStart}
          events={events}
          selectedEventId={selectedEvent?.id ?? null}
          onEventClick={setSelectedEvent}
        />

        {/* Empty state overlay */}
        {!loading && events.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <p className="text-sm text-slate-500 bg-base/80 px-4 py-2 rounded-lg">
              No events this week
            </p>
          </div>
        )}
      </div>

      {/* Event detail drawer */}
      <EventDetailDrawer
        event={selectedEvent}
        onClose={() => setSelectedEvent(null)}
      />
    </div>
  );
}

export default function WorkspaceCalendarPage({ params }: { params: Promise<{ accountId: string }> }) {
  const { accountId } = use(params);
  return (
    <WorkspaceShell accountId={accountId}>
      <CalendarContent />
    </WorkspaceShell>
  );
}
