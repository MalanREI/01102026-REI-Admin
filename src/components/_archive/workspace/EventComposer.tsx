"use client";

import { useEffect, useState } from "react";
import { Button, Input, Textarea } from "@/src/components/ui";
import { RecipientInput } from "@/src/components/workspace/RecipientInput";
import type { CalendarEvent } from "@/src/lib/types/workspace";

type ComposerMode = "create" | "edit";

const SHOW_AS_OPTIONS = [
  { value: "busy", label: "Busy" },
  { value: "tentative", label: "Tentative" },
  { value: "free", label: "Free" },
  { value: "oof", label: "Out of office" },
];

function toDateStr(d: Date): string {
  return d.toISOString().split("T")[0];
}

function toTimeStr(d: Date): string {
  return d.toTimeString().slice(0, 5);
}

export function EventComposer({
  open,
  onClose,
  accountId,
  mode,
  initialEvent,
  defaultStart,
  defaultEnd,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  accountId: string;
  mode: ComposerMode;
  initialEvent?: CalendarEvent;
  defaultStart?: Date;
  defaultEnd?: Date;
  onSaved?: () => void;
}) {
  const [subject, setSubject] = useState("");
  const [dateStr, setDateStr] = useState("");
  const [startTimeStr, setStartTimeStr] = useState("");
  const [endTimeStr, setEndTimeStr] = useState("");
  const [location, setLocation] = useState("");
  const [attendees, setAttendees] = useState<string[]>([]);
  const [body, setBody] = useState("");
  const [isAllDay, setIsAllDay] = useState(false);
  const [isOnlineMeeting, setIsOnlineMeeting] = useState(false);
  const [showAs, setShowAs] = useState("busy");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setSaving(false);
    setDeleting(false);

    if (mode === "edit" && initialEvent) {
      const s = new Date(initialEvent.start_at);
      const e = new Date(initialEvent.end_at);
      setSubject(initialEvent.subject ?? "");
      setDateStr(toDateStr(s));
      setStartTimeStr(toTimeStr(s));
      setEndTimeStr(toTimeStr(e));
      setLocation(initialEvent.location ?? "");
      setAttendees(
        (initialEvent.attendees ?? [])
          .map((a) => a.emailAddress?.address)
          .filter((a): a is string => !!a)
      );
      setBody(initialEvent.body_text ?? "");
      setIsAllDay(initialEvent.is_all_day);
      setIsOnlineMeeting(!!initialEvent.online_meeting_url);
      setShowAs(initialEvent.show_as ?? "busy");
    } else {
      const now = defaultStart ?? new Date(Date.now() + 60 * 60 * 1000);
      const later = defaultEnd ?? new Date(now.getTime() + 60 * 60 * 1000);
      setSubject("");
      setDateStr(toDateStr(now));
      setStartTimeStr(toTimeStr(now));
      setEndTimeStr(toTimeStr(later));
      setLocation("");
      setAttendees([]);
      setBody("");
      setIsAllDay(false);
      setIsOnlineMeeting(false);
      setShowAs("busy");
    }
  }, [open, mode, initialEvent, defaultStart, defaultEnd]);

  async function handleSave() {
    setError(null);
    if (!subject.trim()) { setError("Subject is required."); return; }
    if (!dateStr) { setError("Date is required."); return; }

    setSaving(true);
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const startAt = isAllDay ? `${dateStr}T00:00:00` : `${dateStr}T${startTimeStr}:00`;
    const endAt = isAllDay ? `${dateStr}T23:59:59` : `${dateStr}T${endTimeStr}:00`;

    try {
      const endpoint = "/api/calendar/event";
      const method = mode === "create" ? "POST" : "PATCH";
      const payload = mode === "create"
        ? {
            accountId,
            subject,
            body: body || undefined,
            startAt,
            endAt,
            timeZone: tz,
            location: location || undefined,
            attendees: attendees.length > 0 ? attendees : undefined,
            isAllDay,
            showAs,
            isOnlineMeeting,
          }
        : {
            accountId,
            eventId: initialEvent?.id,
            patch: {
              subject,
              body: body || undefined,
              startAt,
              endAt,
              timeZone: tz,
              location: location || undefined,
              attendees: attendees.length > 0 ? attendees : undefined,
              isAllDay,
              showAs,
            },
          };

      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.message || data.error || "Failed to save event.");
        setSaving(false);
        return;
      }

      onSaved?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save event.");
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!initialEvent) return;
    if (!window.confirm(`Delete "${initialEvent.subject}"?`)) return;
    setDeleting(true);
    try {
      const res = await fetch("/api/calendar/event", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, eventId: initialEvent.id }),
      });
      if (res.ok) {
        onSaved?.();
        onClose();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.message || "Failed to delete event.");
        setDeleting(false);
      }
    } catch {
      setError("Failed to delete event.");
      setDeleting(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl bg-elevated border border-white/[0.08] rounded-xl shadow-2xl flex flex-col"
        style={{ maxHeight: "85vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.06] bg-surface rounded-t-xl shrink-0">
          <h3 className="text-sm font-semibold text-slate-100">
            {mode === "create" ? "New event" : "Edit event"}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 text-sm">✕</button>
        </div>

        {/* Form */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Subject *</label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Meeting subject" />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Date *</label>
              <Input type="date" value={dateStr} onChange={(e) => setDateStr(e.target.value)} />
            </div>
            {!isAllDay && (
              <>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Start</label>
                  <Input type="time" value={startTimeStr} onChange={(e) => setStartTimeStr(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">End</label>
                  <Input type="time" value={endTimeStr} onChange={(e) => setEndTimeStr(e.target.value)} />
                </div>
              </>
            )}
          </div>

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
              <input type="checkbox" checked={isAllDay} onChange={(e) => setIsAllDay(e.target.checked)} className="rounded" />
              All day
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
              <input type="checkbox" checked={isOnlineMeeting} onChange={(e) => setIsOnlineMeeting(e.target.checked)} className="rounded" />
              Online meeting
            </label>
          </div>

          <div>
            <label className="text-xs text-slate-400 mb-1 block">Location</label>
            <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Room or address" />
          </div>

          <RecipientInput value={attendees} onChange={setAttendees} label="Inv" placeholder="Add attendees…" />

          <div>
            <label className="text-xs text-slate-400 mb-1 block">Show as</label>
            <select
              value={showAs}
              onChange={(e) => setShowAs(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-base px-3 py-2 text-sm text-slate-200 outline-none"
            >
              {SHOW_AS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs text-slate-400 mb-1 block">Notes</label>
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} placeholder="Optional notes…" />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-white/[0.06] shrink-0">
          <div className="flex items-center gap-2">
            {mode === "edit" && (
              <Button
                variant="ghost"
                className="text-xs text-red-400 hover:text-red-300 border-red-500/30"
                onClick={handleDelete}
                disabled={deleting || saving}
              >
                {deleting ? "Deleting…" : "Delete"}
              </Button>
            )}
            {error && <span className="text-xs text-red-400">{error}</span>}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose} disabled={saving || deleting}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || deleting}>
              {saving ? "Saving…" : mode === "create" ? "Create" : "Save"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
