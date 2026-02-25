"use client";
import { useState } from "react";
import { Modal, Button, Input } from "@/src/components/ui";
import type { ContentPost, NewContentSchedule, ScheduleType } from "@/src/lib/types/social-media";

interface SchedulePostModalProps {
  open: boolean;
  post: ContentPost | null;
  onClose: () => void;
  /** Called after a schedule has been successfully created. */
  onScheduled: () => void;
}

const DEFAULT_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

/**
 * Modal for scheduling a content post (one-time or recurring).
 */
export function SchedulePostModal({
  open,
  post,
  onClose,
  onScheduled,
}: SchedulePostModalProps) {
  const [scheduleType, setScheduleType] = useState<ScheduleType>("one_time");
  const [scheduledAt, setScheduledAt] = useState("");
  const [recurrenceRule, setRecurrenceRule] = useState("");
  const [recurrenceEndDate, setRecurrenceEndDate] = useState("");
  const [timezone, setTimezone] = useState(DEFAULT_TZ);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!post) return;
    setError("");
    setSaving(true);

    const payload: NewContentSchedule = {
      post_id: post.id,
      schedule_type: scheduleType,
      scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
      recurrence_rule: scheduleType === "recurring" ? recurrenceRule || null : null,
      recurrence_end_date:
        scheduleType === "recurring" && recurrenceEndDate
          ? new Date(recurrenceEndDate).toISOString()
          : null,
      timezone,
      is_active: true,
      last_run_at: null,
      next_run_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
      created_by: null,
    };

    try {
      const res = await fetch("/api/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Failed to schedule post.");
        return;
      }
      onScheduled();
      onClose();
      // Reset form
      setScheduleType("one_time");
      setScheduledAt("");
      setRecurrenceRule("");
      setRecurrenceEndDate("");
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title="Schedule Post"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button form="schedule-form" type="submit" disabled={saving}>
            {saving ? "Scheduling…" : "Schedule"}
          </Button>
        </>
      }
    >
      {post && (
        <div className="mb-4 rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2">
          <p className="text-xs text-slate-500 mb-0.5">Scheduling post:</p>
          <p className="text-sm text-slate-200 font-medium truncate">
            {post.title || post.body.slice(0, 80)}
          </p>
        </div>
      )}

      <form id="schedule-form" onSubmit={handleSubmit} className="space-y-4">
        {/* Schedule type */}
        <div>
          <label className="block text-xs text-slate-400 mb-1.5">Schedule Type</label>
          <div className="flex gap-3">
            {(["one_time", "recurring"] as ScheduleType[]).map((t) => (
              <label key={t} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="scheduleType"
                  value={t}
                  checked={scheduleType === t}
                  onChange={() => setScheduleType(t)}
                  className="accent-emerald-500"
                />
                <span className="text-sm text-slate-300 capitalize">
                  {t === "one_time" ? "One-time" : "Recurring"}
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* Scheduled date/time */}
        <div>
          <label className="block text-xs text-slate-400 mb-1.5">
            {scheduleType === "one_time" ? "Publish Date & Time" : "First Publish Date & Time"}
          </label>
          <Input
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            required={scheduleType === "one_time"}
          />
        </div>

        {/* Recurring-specific fields */}
        {scheduleType === "recurring" && (
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
                required
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

        {/* Timezone */}
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
    </Modal>
  );
}
