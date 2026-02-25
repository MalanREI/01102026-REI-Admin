"use client";
import { useState } from "react";
import { Modal, Button, Input } from "@/src/components/ui";
import type { CalendarEvent } from "@/src/lib/types/social-media";
import { describeCron } from "@/src/lib/supabase/scheduling-queries";

interface ReschedulePostModalProps {
  open: boolean;
  event: CalendarEvent | null;
  onClose: () => void;
  /** Called after a schedule has been successfully updated. */
  onRescheduled: () => void;
}

/**
 * Modal for updating an existing schedule (one-time or recurring).
 */
export function ReschedulePostModal({
  open,
  event,
  onClose,
  onRescheduled,
}: ReschedulePostModalProps) {
  const [scheduledAt, setScheduledAt] = useState(
    event?.scheduled_at ? event.scheduled_at.slice(0, 16) : ""
  );
  const [recurrenceRule, setRecurrenceRule] = useState(event?.recurrence_rule ?? "");
  const [recurrenceEndDate, setRecurrenceEndDate] = useState(
    event?.recurrence_end_date ? event.recurrence_end_date.slice(0, 10) : ""
  );
  const [timezone, setTimezone] = useState(event?.timezone ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Sync state when event changes (modal re-open)
  const handleOpen = () => {
    if (event) {
      setScheduledAt(event.scheduled_at ? event.scheduled_at.slice(0, 16) : "");
      setRecurrenceRule(event.recurrence_rule ?? "");
      setRecurrenceEndDate(
        event.recurrence_end_date ? event.recurrence_end_date.slice(0, 10) : ""
      );
      setTimezone(event.timezone ?? "");
      setError("");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!event) return;
    setError("");
    setSaving(true);

    const updates: Record<string, unknown> = {
      id: event.schedule_id,
      timezone,
    };

    if (event.schedule_type === "one_time") {
      updates.scheduled_at = scheduledAt ? new Date(scheduledAt).toISOString() : null;
      updates.next_run_at = scheduledAt ? new Date(scheduledAt).toISOString() : null;
    } else {
      updates.recurrence_rule = recurrenceRule || null;
      updates.recurrence_end_date = recurrenceEndDate
        ? new Date(recurrenceEndDate).toISOString()
        : null;
      if (scheduledAt) {
        updates.scheduled_at = new Date(scheduledAt).toISOString();
        updates.next_run_at = new Date(scheduledAt).toISOString();
      }
    }

    try {
      const res = await fetch("/api/schedule", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Failed to update schedule.");
        return;
      }
      onRescheduled();
      onClose();
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!event || !confirm("Remove this schedule?")) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/schedule?id=${event.schedule_id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Failed to delete schedule.");
        return;
      }
      onRescheduled();
      onClose();
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title="Reschedule Post"
      onClose={onClose}
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          <Button
            variant="ghost"
            onClick={handleDelete}
            disabled={saving}
            className="text-red-400 hover:text-red-300"
          >
            Remove schedule
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button form="reschedule-form" type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save Changes"}
            </Button>
          </div>
        </div>
      }
    >
      {event && (
        <>
          <div className="mb-4 rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2">
            <p className="text-xs text-slate-500 mb-0.5">Rescheduling:</p>
            <p className="text-sm text-slate-200 font-medium truncate">
              {event.post_title || event.post_body.slice(0, 80)}
            </p>
            {event.schedule_type === "recurring" && event.recurrence_rule && (
              <p className="text-xs text-slate-500 mt-0.5">
                Current: {describeCron(event.recurrence_rule)}
              </p>
            )}
          </div>

          <form
            id="reschedule-form"
            onSubmit={(e) => {
              handleOpen();
              handleSubmit(e);
            }}
            className="space-y-4"
          >
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">
                {event.schedule_type === "one_time"
                  ? "New Publish Date & Time"
                  : "New First Run Date & Time (optional)"}
              </label>
              <Input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                required={event.schedule_type === "one_time"}
              />
            </div>

            {event.schedule_type === "recurring" && (
              <>
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5">
                    Cron Expression{" "}
                    <span className="text-slate-600">(e.g. 0 9 * * 1 = every Monday at 09:00)</span>
                  </label>
                  <Input
                    type="text"
                    placeholder="0 9 * * 1"
                    value={recurrenceRule}
                    onChange={(e) => setRecurrenceRule(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5">
                    Recurrence End Date <span className="text-slate-600">(optional)</span>
                  </label>
                  <Input
                    type="date"
                    value={recurrenceEndDate}
                    onChange={(e) => setRecurrenceEndDate(e.target.value)}
                  />
                </div>
              </>
            )}

            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Timezone</label>
              <Input
                type="text"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                placeholder="America/New_York"
              />
            </div>

            {error && (
              <p className="text-xs text-red-400 rounded-lg bg-red-900/20 px-3 py-2">{error}</p>
            )}
          </form>
        </>
      )}
    </Modal>
  );
}
