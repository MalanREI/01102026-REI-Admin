"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/src/lib/supabase/browser";
import { Button, Card, Input, Modal, Textarea } from "@/src/components/ui";
import { prettyDate } from "@/src/lib/format";
import { PageShell } from "@/src/components/PageShell";

type Meeting = {
  id: string;
  title: string;
  location: string | null;
  start_at: string;
  duration_minutes: number;
  rrule: string | null;
  archived: boolean;
};

type ParsedAttendee = { email: string; full_name: string | null };

// Accept formats like:
// - "Alan M. <alan@domain.com>"
// - "Alan M., alan@domain.com"
// - "alan@domain.com"
function parseAttendees(input: string): ParsedAttendee[] {
  const lines = (input ?? "")
    .split(/\n|;/g)
    .map((s) => s.trim())
    .filter(Boolean);

  const out: ParsedAttendee[] = [];

  for (const line of lines) {
    // Name <email>
    const angle = /(.*)<([^>]+)>/.exec(line);
    if (angle) {
      const full_name = angle[1]?.trim()?.replace(/^"|"$/g, "") || null;
      const email = angle[2]?.trim()?.replace(/^"|"$/g, "") || "";
      if (email) out.push({ email, full_name });
      continue;
    }

    // Name, email
    const commaParts = line.split(",").map((s) => s.trim()).filter(Boolean);
    if (commaParts.length === 2 && commaParts[1].includes("@")) {
      out.push({ email: commaParts[1], full_name: commaParts[0] || null });
      continue;
    }

    // Maybe "Name email@domain.com" or just "email@domain.com"
    const tokens = line.split(/\s+/g).filter(Boolean);
    const emailToken = tokens.find((t) => t.includes("@")) ?? "";
    if (!emailToken) continue;

    const nameTokens = tokens.filter((t) => t !== emailToken);
    const full_name = nameTokens.length ? nameTokens.join(" ") : null;
    out.push({ email: emailToken, full_name });
  }

  // de-dupe by email (keep first name encountered)
  const seen = new Set<string>();
  const deduped: ParsedAttendee[] = [];
  for (const a of out) {
    const key = a.email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push({ email: a.email, full_name: a.full_name });
  }
  return deduped;
}

function rruleFromPreset(preset: string): string | null {
  switch (preset) {
    case "none":
      return null;
    case "weekly":
      return "FREQ=WEEKLY;INTERVAL=1";
    case "biweekly":
      return "FREQ=WEEKLY;INTERVAL=2";
    case "monthly":
      return "FREQ=MONTHLY;INTERVAL=1";
    default:
      return null;
  }
}

function presetFromRrule(rrule: string | null | undefined): string {
  const r = (rrule || "").toUpperCase();
  if (!r) return "none";
  if (r.includes("FREQ=WEEKLY") && r.includes("INTERVAL=2")) return "biweekly";
  if (r.includes("FREQ=WEEKLY")) return "weekly";
  if (r.includes("FREQ=MONTHLY")) return "monthly";
  return "custom";
}

export default function MeetingsPage() {
  const sb = useMemo(() => supabaseBrowser(), []);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);

  const [open, setOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [editingMeetingId, setEditingMeetingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [startAt, setStartAt] = useState("");
  const [duration, setDuration] = useState(60);
  const [freq, setFreq] = useState("weekly");
  const [attendees, setAttendees] = useState("");
  const [agendaSeed, setAgendaSeed] = useState(
    "A1 - Opening & Recap\nA2 - Review Milestones\nB1 - Residential Operations\nB2 - Commercial Operations\nC1 - Marketing & Outreach\nC2 - Team Operations\nD1 - Open Discussion"
  );
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    let q = sb
      .from("meetings")
      .select("id,title,location,start_at,duration_minutes,rrule,archived")
      .order("start_at", { ascending: true });

    if (!showArchived) {
      q = q.eq("archived", false);
    }

    const { data, error } = await q;
    if (!error) setMeetings(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showArchived]);

  async function saveMeeting() {
    setBusy(true);
    setErr(null);
    try {
      if (!title.trim()) throw new Error("Meeting name is required.");
      if (!startAt) throw new Error("Date/time is required.");

      const { data: userData } = await sb.auth.getUser();
      const userId = userData?.user?.id ?? null;

      let meetingId = editingMeetingId;

      if (!meetingId) {
        const { data: created, error } = await sb
          .from("meetings")
          .insert({
            title: title.trim(),
            location: location.trim() || null,
            start_at: new Date(startAt).toISOString(),
            duration_minutes: Number(duration) || 60,
            rrule: rruleFromPreset(freq),
            created_by: userId,
          })
          .select("id")
          .single();
        if (error) throw error;
        meetingId = created.id as string;
      } else {
        const up = await sb
          .from("meetings")
          .update({
            title: title.trim(),
            location: location.trim() || null,
            start_at: new Date(startAt).toISOString(),
            duration_minutes: Number(duration) || 60,
            rrule: rruleFromPreset(freq),
          })
          .eq("id", meetingId);
        if (up.error) throw up.error;
      }

      // Attendees (store email; map to profile id if exists)
      const parsed = parseAttendees(attendees);
      // reset attendees for edits
      {
        const del = await sb.from("meeting_attendees").delete().eq("meeting_id", meetingId);
        if (del.error) {
          // ignore
        }
      }
      if (parsed.length) {
        const emails = parsed.map((a) => a.email.toLowerCase());
        const pr = await sb.from("profiles").select("id,email").in("email", emails);

        const emailToUserId = new Map<string, string>();
        if (!pr.error) {
          for (const p of pr.data ?? []) {
            const typedP = p as { email?: string; id: string };
            const e = String(typedP.email ?? "").toLowerCase();
            if (e) emailToUserId.set(e, String(typedP.id));
          }
        }

        const rows = parsed.map((a) => {
          const key = a.email.toLowerCase();
          const user_id = emailToUserId.get(key) ?? null;
          return {
            meeting_id: meetingId,
            email: a.email.trim(),
            user_id,
          };
        });

        const ins = await sb.from("meeting_attendees").insert(rows);
        if (ins.error) throw ins.error;
      }

      // Default task columns (new meetings only)
      if (!editingMeetingId) {
      const defaultColumns = [
        "MILESTONES",
        "Residential Operations",
        "Commercial Operations",
        "Marketing/Outreach",
        "Team Operations",
      ];
      const colRows = defaultColumns.map((name, idx) => ({ meeting_id: meetingId, name, position: idx + 1 }));
      const colIns = await sb.from("meeting_task_columns").insert(colRows);
      if (colIns.error) throw colIns.error;

      // Default statuses (safe no-op if table missing)
      {
        const ins = await sb.from("meeting_task_statuses").insert([
          { meeting_id: meetingId, name: "In Progress", position: 1 },
          { meeting_id: meetingId, name: "Needs Review", position: 2 },
          { meeting_id: meetingId, name: "Waiting", position: 3 },
          { meeting_id: meetingId, name: "Completed", position: 4 },
        ]);

        if (ins.error) {
          // no-op
        }
      }

      // Agenda seed (new meetings only)
      }
      if (!editingMeetingId) {
      const agendaLines = agendaSeed
        .split(/\n/g)
        .map((s) => s.trim())
        .filter(Boolean);
      if (agendaLines.length) {
        const agendaRows = agendaLines.map((line, idx) => {
          const m = /^([A-Z]\d+)\s*-\s*(.+)$/.exec(line);
          return {
            meeting_id: meetingId,
            code: m?.[1] ?? null,
            title: (m?.[2] ?? line).trim(),
            position: idx + 1,
          };
        });
        const aIns = await sb.from("meeting_agenda_items").insert(agendaRows);
        if (aIns.error) throw aIns.error;
      }
      }

      // Send calendar invites (SMTP + ICS)
      await fetch("/api/meetings/ai/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meetingId }),
      }).catch(() => null);

      setOpen(false);
      setEditingMeetingId(null);
      setTitle("");
      setLocation("");
      setStartAt("");
      setDuration(60);
      setAttendees("");
      await load();
      window.location.href = `/meetings/${meetingId}`;
    } catch (e: unknown) {
      setErr((e as Error)?.message ?? "Failed to save meeting");
    } finally {
      setBusy(false);
    }
  }

  async function startEditMeeting(meetingId: string) {
    setErr(null);
    const m = await sb
      .from("meetings")
      .select("id,title,location,start_at,duration_minutes,rrule")
      .eq("id", meetingId)
      .single();
    if (m.error) {
      alert(m.error.message);
      return;
    }

    const a = await sb.from("meeting_attendees").select("email").eq("meeting_id", meetingId);
    const aEmails = (a.data ?? []).map((r: { email?: string }) => String(r.email ?? "").trim()).filter(Boolean);

    setEditingMeetingId(meetingId);
    setTitle(String(m.data?.title ?? ""));
    setLocation(String(m.data?.location ?? ""));
    const startIso = String(m.data?.start_at ?? "");
    // datetime-local expects YYYY-MM-DDTHH:MM
    setStartAt(startIso ? new Date(startIso).toISOString().slice(0, 16) : "");
    setDuration(Number(m.data?.duration_minutes ?? 60));
    setFreq(presetFromRrule(m.data?.rrule ?? null));
    setAttendees(aEmails.join("\n"));
    setOpen(true);
  }

  async function toggleArchiveMeeting(meetingId: string, isArchived: boolean) {
    try {
      const { data: userData } = await sb.auth.getUser();
      const userId = userData?.user?.id ?? null;
      const up = await sb
        .from("meetings")
        .update({
          archived: !isArchived,
          archived_at: !isArchived ? new Date().toISOString() : null,
          archived_by: !isArchived ? userId : null,
        })
        .eq("id", meetingId);
      if (up.error) throw up.error;
      await load();
    } catch (e: unknown) {
      alert((e as Error)?.message ?? "Failed to update archive status");
    }
  }

  async function deleteMeeting(meetingId: string) {
    const ok = window.confirm("Delete this meeting? This cannot be undone.");
    if (!ok) return;
    try {
      const del = await sb.from("meetings").delete().eq("id", meetingId);
      if (del.error) throw del.error;
      await load();
    } catch (e: unknown) {
      alert((e as Error)?.message ?? "Failed to delete meeting");
    }
  }

  return (
    <PageShell>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Meetings</h1>
            <p className="text-sm text-gray-600">Create meetings, manage agenda + tasks, and record minutes.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="text-xs rounded-full border bg-white px-2 py-1 hover:bg-gray-50"
              onClick={() => setShowArchived((v) => !v)}
            >
              {showArchived ? "Showing Archived" : "Hiding Archived"}
            </button>

            <Button
              onClick={() => {
                setEditingMeetingId(null);
                setOpen(true);
              }}
            >
              Add meeting
            </Button>
          </div>
        </div>

        <Card title="Your meetings">
          {loading ? (
            <div className="text-sm text-gray-600">Loading...</div>
          ) : meetings.length === 0 ? (
            <div className="text-sm text-gray-600">No meetings yet. Click “Add meeting”.</div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {meetings.map((m) => (
                <div key={m.id} className="rounded-2xl border bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <Link href={`/meetings/${m.id}`} className="flex-1 hover:opacity-90">
                      <div className="text-base font-semibold">{m.title}</div>
                      <div className="mt-1 text-sm text-gray-600">
                        {prettyDate(m.start_at)} • {m.duration_minutes} min
                      </div>
                      {m.location && <div className="text-sm text-gray-600">{m.location}</div>}
                      {m.rrule && <div className="mt-2 text-xs text-gray-500">Recurring: {m.rrule}</div>}
                      {m.archived && <div className="mt-2 text-xs text-gray-500">Archived</div>}
                    </Link>

                    <div className="flex flex-col items-end gap-2">
                      <Button
                        variant="ghost"
                        onClick={async () => {
                          await startEditMeeting(m.id);
                        }}
                      >
                        Edit
                      </Button>

                      <Button
                        variant="ghost"
                        onClick={() => void toggleArchiveMeeting(m.id, !!m.archived)}
                      >
                        {m.archived ? "Unarchive" : "Archive"}
                      </Button>

                      <Button
                        variant="ghost"
                        onClick={() => void deleteMeeting(m.id)}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Modal
          open={open}
          title={editingMeetingId ? "Edit meeting" : "Add meeting"}
          onClose={() => {
            setOpen(false);
            setErr(null);
            setEditingMeetingId(null);
          }}
          footer={
            <>
              <Button
                variant="ghost"
                onClick={() => {
                  setOpen(false);
                  setEditingMeetingId(null);
                }}
              >
                Cancel
              </Button>
              <Button onClick={saveMeeting} disabled={busy}>
                {busy ? "Saving..." : "Save"}
              </Button>
            </>
          }
        >
          <div className="grid gap-3 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="text-xs text-gray-600">Meeting name</label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Operations Weekly" />
            </div>
            <div>
              <label className="text-xs text-gray-600">Date/time</label>
              <Input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-gray-600">Duration (minutes)</label>
              <Input type="number" min={15} value={duration} onChange={(e) => setDuration(Number(e.target.value))} />
            </div>
            <div>
              <label className="text-xs text-gray-600">Location</label>
              <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Zoom / Office" />
            </div>
            <div>
              <label className="text-xs text-gray-600">Frequency</label>
              <select
                className="w-full rounded-lg border px-3 py-2 text-sm"
                value={freq}
                onChange={(e) => setFreq(e.target.value)}
              >
                <option value="none">One-time</option>
                <option value="weekly">Weekly</option>
                <option value="biweekly">Bi-weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="text-xs text-gray-600">
                Attendees (email-only OR “Name &lt;email&gt;” OR “Name, email”)
              </label>
              <Textarea
                rows={3}
                value={attendees}
                onChange={(e) => setAttendees(e.target.value)}
                placeholder={'Alan M. <alan@...>\nNate G., nate@...\nbraden@...'}
              />
              <div className="mt-1 text-xs text-gray-500">
                These are used for (1) sending minutes/invites and (2) task owner assignment.
              </div>
            </div>
            <div className="md:col-span-2">
              <label className="text-xs text-gray-600">Default agenda topics (editable later)</label>
              <Textarea rows={6} value={agendaSeed} onChange={(e) => setAgendaSeed(e.target.value)} />
            </div>
          </div>
          {err && (
            <div className="mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">{err}</div>
          )}
        </Modal>
      </div>
    </PageShell>
  );
}
