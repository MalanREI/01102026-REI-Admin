"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { DndContext, DragEndEvent, useDraggable, useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { supabaseBrowser } from "@/src/lib/supabase/browser";
import { Button, Card, Input, Modal, Pill, Textarea } from "@/src/components/ui";
import { prettyDate } from "@/src/lib/format";

type Meeting = {
  id: string;
  title: string;
  location: string | null;
  start_at: string;
  duration_minutes: number;
  rrule: string | null;
};

type Profile = { id: string; full_name: string | null; color_hex: string | null };

type Column = { id: string; name: string; position: number };

type Task = {
  id: string;
  column_id: string;
  title: string;
  status: string;
  priority: string;
  owner_id: string | null;
  start_date: string | null;
  due_date: string | null;
  notes: string | null;
  position: number;
  updated_at: string;
};

type AgendaItem = { id: string; code: string | null; title: string; description: string | null; position: number };

type MinutesSession = { id: string; started_at: string; ended_at: string | null };

type TaskEvent = { id: string; event_type: string; payload: any; created_at: string };

function DroppableColumn({ id, children }: { id: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={["rounded-2xl border bg-gray-50 p-3 min-h-[200px]", isOver ? "ring-2 ring-gray-300" : ""].join(" ")}> 
      {children}
    </div>
  );
}

function DraggableTaskCard({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.6 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
      {children}
    </div>
  );
}

function sortByPos<T extends { position: number }>(arr: T[]): T[] {
  return [...arr].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
}

function toISODate(d: string | null): string {
  return d ? d : "";
}

export default function MeetingDetailPage() {
  const params = useParams<{ id: string }>();
  const meetingId = params.id;
  const sb = useMemo(() => supabaseBrowser(), []);

  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [columns, setColumns] = useState<Column[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [agenda, setAgenda] = useState<AgendaItem[]>([]);
  const [currentSession, setCurrentSession] = useState<MinutesSession | null>(null);
  const [prevSession, setPrevSession] = useState<MinutesSession | null>(null);
  const [agendaNotes, setAgendaNotes] = useState<Record<string, string>>({}); // agendaItemId -> current notes
  const [prevAgendaNotes, setPrevAgendaNotes] = useState<Record<string, string>>({});

  // Task modal
  const [taskOpen, setTaskOpen] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [tTitle, setTTitle] = useState("");
  const [tStatus, setTStatus] = useState("In Progress");
  const [tPriority, setTPriority] = useState("Normal");
  const [tOwner, setTOwner] = useState<string | "">("");
  const [tStart, setTStart] = useState("");
  const [tDue, setTDue] = useState("");
  const [tNotes, setTNotes] = useState("");
  const [tColumnId, setTColumnId] = useState<string>("");
  const [tEvents, setTEvents] = useState<TaskEvent[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Agenda edit
  const [agendaOpen, setAgendaOpen] = useState(false);

  // Recording
  const [recOpen, setRecOpen] = useState(false);
  const [recBusy, setRecBusy] = useState(false);
  const [recErr, setRecErr] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const tickRef = useRef<number | null>(null);

  function ownerColor(ownerId: string | null): string {
    if (!ownerId) return "#E5E7EB";
    const p = profiles.find((x) => x.id === ownerId);
    return p?.color_hex || "#E5E7EB";
  }

  async function loadAll() {
    // Meeting
    const m = await sb
      .from("meetings")
      .select("id,title,location,start_at,duration_minutes,rrule")
      .eq("id", meetingId)
      .single();
    if (m.error) throw m.error;
    setMeeting(m.data as any);

    // Profiles
    const pr = await sb.from("profiles").select("id,full_name,color_hex").order("created_at", { ascending: true });
    if (!pr.error) setProfiles((pr.data ?? []) as any);

    // Columns
    const c = await sb
      .from("meeting_task_columns")
      .select("id,name,position")
      .eq("meeting_id", meetingId)
      .order("position", { ascending: true });
    if (c.error) throw c.error;
    setColumns((c.data ?? []) as any);

    // Tasks
    const t = await sb
      .from("meeting_tasks")
      .select("id,column_id,title,status,priority,owner_id,start_date,due_date,notes,position,updated_at")
      .eq("meeting_id", meetingId)
      .order("position", { ascending: true });
    if (t.error) throw t.error;
    setTasks((t.data ?? []) as any);

    // Agenda
    const a = await sb
      .from("meeting_agenda_items")
      .select("id,code,title,description,position")
      .eq("meeting_id", meetingId)
      .order("position", { ascending: true });
    if (a.error) throw a.error;
    setAgenda((a.data ?? []) as any);

    // Sessions (latest + previous)
    const s = await sb
      .from("meeting_minutes_sessions")
      .select("id,started_at,ended_at")
      .eq("meeting_id", meetingId)
      .order("started_at", { ascending: false })
      .limit(2);
    if (s.error) throw s.error;
    const sessions = (s.data ?? []) as any as MinutesSession[];
    setCurrentSession(sessions[0] ?? null);
    setPrevSession(sessions[1] ?? null);

    // Notes for current + previous
    if (sessions[0]?.id) await loadAgendaNotes(sessions[0].id, true);
    if (sessions[1]?.id) await loadAgendaNotes(sessions[1].id, false);
  }

  async function loadAgendaNotes(sessionId: string, isCurrent: boolean) {
    const n = await sb
      .from("meeting_agenda_notes")
      .select("agenda_item_id,notes")
      .eq("session_id", sessionId);
    if (n.error) return;
    const map: Record<string, string> = {};
    for (const row of n.data ?? []) {
      map[(row as any).agenda_item_id] = (row as any).notes ?? "";
    }
    if (isCurrent) setAgendaNotes(map);
    else setPrevAgendaNotes(map);
  }

  useEffect(() => {
    (async () => {
      try {
        await loadAll();
      } catch (e: any) {
        setErr(e?.message ?? "Failed to load meeting");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingId]);

  async function ensureCurrentSession() {
    if (currentSession?.ended_at === null) return currentSession;
    // If latest session ended or doesn't exist, create a new one
    const { data: userData } = await sb.auth.getUser();
    const userId = userData?.user?.id ?? null;
    const created = await sb
      .from("meeting_minutes_sessions")
      .insert({ meeting_id: meetingId, created_by: userId })
      .select("id,started_at,ended_at")
      .single();
    if (created.error) throw created.error;
    setPrevSession(currentSession);
    setCurrentSession(created.data as any);
    setPrevAgendaNotes(agendaNotes);
    setAgendaNotes({});
    return created.data as any as MinutesSession;
  }

  async function onNewMinutes() {
    setBusy(true);
    setErr(null);
    try {
      await ensureCurrentSession();
      setRecOpen(true);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to start minutes");
    } finally {
      setBusy(false);
    }
  }

  async function saveAgendaNote(agendaItemId: string, notes: string) {
    if (!currentSession?.id) return;
    setAgendaNotes((m) => ({ ...m, [agendaItemId]: notes }));
    await sb
      .from("meeting_agenda_notes")
      .upsert({ session_id: currentSession.id, agenda_item_id: agendaItemId, notes, updated_at: new Date().toISOString() });
  }

  function openNewTask(colId: string) {
    setEditingTaskId(null);
    setTColumnId(colId);
    setTTitle("");
    setTStatus("In Progress");
    setTPriority("Normal");
    setTOwner("");
    setTStart("");
    setTDue("");
    setTNotes("");
    setTEvents([]);
    setErr(null);
    setTaskOpen(true);
  }

  async function openEditTask(taskId: string) {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    setEditingTaskId(taskId);
    setTColumnId(task.column_id);
    setTTitle(task.title);
    setTStatus(task.status);
    setTPriority(task.priority);
    setTOwner(task.owner_id ?? "");
    setTStart(toISODate(task.start_date));
    setTDue(toISODate(task.due_date));
    setTNotes(task.notes ?? "");
    setTaskOpen(true);

    const ev = await sb
      .from("meeting_task_events")
      .select("id,event_type,payload,created_at")
      .eq("task_id", taskId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (!ev.error) setTEvents((ev.data ?? []) as any);
  }

  async function writeTaskEvent(taskId: string, type: string, payload: any) {
    const { data: userData } = await sb.auth.getUser();
    const userId = userData?.user?.id ?? null;
    await sb.from("meeting_task_events").insert({ task_id: taskId, event_type: type, payload, created_by: userId });
  }

  async function saveTask() {
    setBusy(true);
    setErr(null);
    try {
      if (!tTitle.trim()) throw new Error("Task title is required.");
      if (!tColumnId) throw new Error("Column is required.");
      const { data: userData } = await sb.auth.getUser();
      const userId = userData?.user?.id ?? null;

      if (!editingTaskId) {
        const maxPos = Math.max(0, ...tasks.filter((x) => x.column_id === tColumnId).map((x) => x.position ?? 0));
        const created = await sb
          .from("meeting_tasks")
          .insert({
            meeting_id: meetingId,
            column_id: tColumnId,
            title: tTitle.trim(),
            status: tStatus,
            priority: tPriority,
            owner_id: tOwner || null,
            start_date: tStart || null,
            due_date: tDue || null,
            notes: tNotes || null,
            position: maxPos + 1,
            created_by: userId,
          })
          .select("id,column_id,title,status,priority,owner_id,start_date,due_date,notes,position,updated_at")
          .single();
        if (created.error) throw created.error;
        const newTask = created.data as any as Task;
        setTasks((prev) => [...prev, newTask]);
        await writeTaskEvent(newTask.id, "created", { title: newTask.title });
      } else {
        const before = tasks.find((x) => x.id === editingTaskId);
        const patch: any = {
          title: tTitle.trim(),
          status: tStatus,
          priority: tPriority,
          owner_id: tOwner || null,
          start_date: tStart || null,
          due_date: tDue || null,
          notes: tNotes || null,
          column_id: tColumnId,
          updated_at: new Date().toISOString(),
        };
        const upd = await sb
          .from("meeting_tasks")
          .update(patch)
          .eq("id", editingTaskId)
          .select("id,column_id,title,status,priority,owner_id,start_date,due_date,notes,position,updated_at")
          .single();
        if (upd.error) throw upd.error;
        const after = upd.data as any as Task;
        setTasks((prev) => prev.map((x) => (x.id === after.id ? after : x)));

        const changes: Record<string, any> = {};
        if (before) {
          for (const k of ["title", "status", "priority", "owner_id", "start_date", "due_date", "notes", "column_id"] as const) {
            if ((before as any)[k] !== (after as any)[k]) changes[k] = { from: (before as any)[k], to: (after as any)[k] };
          }
        }
        if (Object.keys(changes).length) {
          await writeTaskEvent(after.id, "updated", { changes });
        }
      }

      setTaskOpen(false);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to save task");
    } finally {
      setBusy(false);
    }
  }

  async function deleteTask() {
    if (!editingTaskId) return;
    setBusy(true);
    try {
      await writeTaskEvent(editingTaskId, "deleted", {});
      const del = await sb.from("meeting_tasks").delete().eq("id", editingTaskId);
      if (del.error) throw del.error;
      setTasks((prev) => prev.filter((x) => x.id !== editingTaskId));
      setTaskOpen(false);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to delete task");
    } finally {
      setBusy(false);
    }
  }

  async function onDragEnd(ev: DragEndEvent) {
    const activeId = String(ev.active.id);
    const overId = ev.over ? String(ev.over.id) : null;
    if (!overId) return;

    // overId corresponds to a column droppable id
    const task = tasks.find((t) => t.id === activeId);
    if (!task) return;
    if (task.column_id === overId) return;

    // Move task and append to bottom of over column
    const maxPos = Math.max(0, ...tasks.filter((x) => x.column_id === overId).map((x) => x.position ?? 0));
    const patch = { column_id: overId, position: maxPos + 1, updated_at: new Date().toISOString() };
    const upd = await sb
      .from("meeting_tasks")
      .update(patch)
      .eq("id", activeId)
      .select("id,column_id,title,status,priority,owner_id,start_date,due_date,notes,position,updated_at")
      .single();
    if (!upd.error) {
      setTasks((prev) => prev.map((x) => (x.id === activeId ? (upd.data as any) : x)));
      await writeTaskEvent(activeId, "moved", { from: task.column_id, to: overId });
    }
  }

  async function startRecording() {
    setRecErr(null);
    try {
      if (!currentSession?.id) throw new Error("Start meeting minutes first.");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
      };
      mr.start();
      mediaRecorderRef.current = mr;
      setIsRecording(true);
      setRecSeconds(0);
      tickRef.current = window.setInterval(() => setRecSeconds((s) => s + 1), 1000);
    } catch (e: any) {
      setRecErr(e?.message ?? "Could not start recording");
    }
  }

  async function stopRecordingAndUpload() {
    if (!mediaRecorderRef.current) return;
    setRecBusy(true);
    setRecErr(null);

    try {
      const mr = mediaRecorderRef.current;
      mr.stop();
      mediaRecorderRef.current = null;
      setIsRecording(false);
      if (tickRef.current) window.clearInterval(tickRef.current);

      const blob = new Blob(chunksRef.current, { type: "audio/webm" });
      if (blob.size < 1000) throw new Error("Recording too short.");

      // Upload to Supabase Storage
      const { data: userData } = await sb.auth.getUser();
      const userId = userData?.user?.id ?? "unknown";
      const path = `meetings/${meetingId}/sessions/${currentSession!.id}/${Date.now()}_${userId}.webm`;

      const up = await sb.storage.from("recordings").upload(path, blob, {
        contentType: "audio/webm",
        upsert: false,
      });
      if (up.error) throw up.error;

      // Save recording row
      const recRow = await sb
        .from("meeting_recordings")
        .insert({ session_id: currentSession!.id, storage_path: path, duration_seconds: recSeconds })
        .select("id")
        .single();
      if (recRow.error) throw recRow.error;

      // Call AI (server route) to transcribe + summarize (optional)
      await fetch("/api/meetings/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meetingId, sessionId: currentSession!.id, recordingPath: path }),
      });

      alert("Recording uploaded. AI summarization will populate agenda notes if configured.");
    } catch (e: any) {
      setRecErr(e?.message ?? "Upload failed");
    } finally {
      setRecBusy(false);
    }
  }

  async function concludeMeeting() {
    if (!currentSession?.id) return;
    setBusy(true);
    try {
      const end = await sb
        .from("meeting_minutes_sessions")
        .update({ ended_at: new Date().toISOString() })
        .eq("id", currentSession.id)
        .select("id,started_at,ended_at")
        .single();
      if (end.error) throw end.error;
      setCurrentSession(end.data as any);
      alert("Meeting concluded.");
    } catch (e: any) {
      setErr(e?.message ?? "Failed to conclude meeting");
    } finally {
      setBusy(false);
    }
  }

  if (!meeting) {
    return <div className="text-sm text-gray-600">Loading...</div>;
  }

  const cols = sortByPos(columns);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{meeting.title}</h1>
          <div className="text-sm text-gray-600">
            {prettyDate(meeting.start_at)} • {meeting.duration_minutes} min{meeting.location ? ` • ${meeting.location}` : ""}
          </div>
          {meeting.rrule && <div className="text-xs text-gray-500 mt-1">Recurring: {meeting.rrule}</div>}
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => setAgendaOpen(true)}>
            Edit agenda
          </Button>
          <Button onClick={onNewMinutes} disabled={busy}>
            New meeting minutes
          </Button>
          <Button variant="ghost" onClick={concludeMeeting} disabled={busy}>
            Conclude meeting
          </Button>
        </div>
      </div>

      {err && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">{err}</div>}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1 space-y-6">
          <Card title="Agenda + Minutes">
            <div className="space-y-4">
              {agenda.length === 0 ? (
                <div className="text-sm text-gray-600">No agenda topics yet.</div>
              ) : (
                sortByPos(agenda).map((a) => (
                  <div key={a.id} className="rounded-xl border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-semibold">
                        {a.code ? `${a.code} - ` : ""}
                        {a.title}
                      </div>
                      {currentSession ? <Pill>Current</Pill> : <Pill>No session</Pill>}
                    </div>
                    {a.description && <div className="text-xs text-gray-600 mt-1">{a.description}</div>}

                    <div className="mt-3 grid gap-2">
                      <div>
                        <div className="text-xs text-gray-500 mb-1">Meeting minutes (current)</div>
                        <Textarea
                          rows={4}
                          value={agendaNotes[a.id] ?? ""}
                          onChange={(e) => saveAgendaNote(a.id, e.target.value)}
                          placeholder="Notes for this agenda topic..."
                          disabled={!currentSession || !!currentSession.ended_at}
                        />
                      </div>
                      <div>
                        <div className="text-xs text-gray-500 mb-1">Previous meeting minutes</div>
                        <Textarea rows={3} value={prevAgendaNotes[a.id] ?? ""} readOnly className="bg-gray-50" />
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>

        <div className="lg:col-span-2 space-y-6">
          <Card
            title="Tasks Board"
            right={<div className="text-xs text-gray-500">Drag cards between columns</div>}
          >
            <DndContext onDragEnd={onDragEnd}>
              <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${Math.max(cols.length, 1)}, minmax(220px, 1fr))` }}>
                {cols.map((c) => (
                  <DroppableColumn key={c.id} id={c.id}>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="text-sm font-semibold">{c.name}</div>
                      <Button variant="ghost" onClick={() => openNewTask(c.id)}>
                        +
                      </Button>
                    </div>
                    <div className="space-y-2">
                      {sortByPos(tasks.filter((t) => t.column_id === c.id)).map((t) => (
                        <DraggableTaskCard key={t.id} id={t.id}>
                          <div
                            className="rounded-xl border bg-white p-3 cursor-pointer"
                            style={{ borderLeft: `6px solid ${ownerColor(t.owner_id)}` }}
                            onClick={() => openEditTask(t.id)}
                          >
                            <div className="text-sm font-semibold">{t.title}</div>
                            <div className="mt-1 flex flex-wrap gap-2">
                              <Pill>{t.status}</Pill>
                              <Pill>{t.priority}</Pill>
                              {t.due_date && <Pill>Due {t.due_date}</Pill>}
                            </div>
                          </div>
                        </DraggableTaskCard>
                      ))}
                    </div>
                  </DroppableColumn>
                ))}
              </div>
            </DndContext>
          </Card>
        </div>
      </div>

      {/* Task Modal */}
      <Modal
        open={taskOpen}
        title={editingTaskId ? "Edit Task" : "New Task"}
        onClose={() => setTaskOpen(false)}
        footer={
          <>
            {editingTaskId && (
              <Button variant="ghost" onClick={deleteTask} disabled={busy}>
                Delete
              </Button>
            )}
            <Button variant="ghost" onClick={() => setTaskOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveTask} disabled={busy}>
              {busy ? "Saving..." : "Save"}
            </Button>
          </>
        }
      >
        <div className="grid gap-3 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="text-xs text-gray-600">Title</label>
            <Input value={tTitle} onChange={(e) => setTTitle(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-gray-600">Status</label>
            <select className="w-full rounded-lg border px-3 py-2 text-sm" value={tStatus} onChange={(e) => setTStatus(e.target.value)}>
              <option>In Progress</option>
              <option>Needs Review</option>
              <option>Sidebar Task</option>
              <option>Completed</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-600">Priority</label>
            <select className="w-full rounded-lg border px-3 py-2 text-sm" value={tPriority} onChange={(e) => setTPriority(e.target.value)}>
              <option>Low</option>
              <option>Normal</option>
              <option>High</option>
              <option>!Urgent!</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-600">Owner</label>
            <select className="w-full rounded-lg border px-3 py-2 text-sm" value={tOwner} onChange={(e) => setTOwner(e.target.value)}>
              <option value="">Unassigned</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name || p.id.slice(0, 8)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-600">Column</label>
            <select className="w-full rounded-lg border px-3 py-2 text-sm" value={tColumnId} onChange={(e) => setTColumnId(e.target.value)}>
              {cols.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-600">Start date</label>
            <Input type="date" value={tStart} onChange={(e) => setTStart(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-gray-600">Due date</label>
            <Input type="date" value={tDue} onChange={(e) => setTDue(e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs text-gray-600">Notes</label>
            <Textarea rows={5} value={tNotes} onChange={(e) => setTNotes(e.target.value)} />
          </div>
        </div>

        {editingTaskId && (
          <div className="mt-4">
            <div className="text-sm font-semibold mb-2">Activity log</div>
            <div className="max-h-56 overflow-auto rounded-xl border bg-gray-50">
              {tEvents.length === 0 ? (
                <div className="p-3 text-sm text-gray-600">No events yet.</div>
              ) : (
                <div className="divide-y">
                  {tEvents.map((e) => (
                    <div key={e.id} className="p-3 text-sm">
                      <div className="flex items-center justify-between">
                        <div className="font-medium">{e.event_type}</div>
                        <div className="text-xs text-gray-500">{prettyDate(e.created_at)}</div>
                      </div>
                      <pre className="mt-2 text-xs text-gray-700 whitespace-pre-wrap">{JSON.stringify(e.payload, null, 2)}</pre>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Agenda Editor */}
      <Modal
        open={agendaOpen}
        title="Edit agenda topics"
        onClose={() => setAgendaOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setAgendaOpen(false)}>
              Close
            </Button>
          </>
        }
      >
        <div className="text-sm text-gray-600 mb-3">
          For now, edit agenda topics directly by changing the title/description fields. (Next: drag reorder + add/remove.)
        </div>
        <div className="space-y-3">
          {sortByPos(agenda).map((a) => (
            <div key={a.id} className="rounded-xl border p-3">
              <div className="grid gap-2 md:grid-cols-3">
                <div>
                  <label className="text-xs text-gray-600">Code</label>
                  <Input
                    value={a.code ?? ""}
                    onChange={async (e) => {
                      const code = e.target.value;
                      setAgenda((prev) => prev.map((x) => (x.id === a.id ? { ...x, code } : x)));
                      await sb.from("meeting_agenda_items").update({ code }).eq("id", a.id);
                    }}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs text-gray-600">Title</label>
                  <Input
                    value={a.title}
                    onChange={async (e) => {
                      const title = e.target.value;
                      setAgenda((prev) => prev.map((x) => (x.id === a.id ? { ...x, title } : x)));
                      await sb.from("meeting_agenda_items").update({ title }).eq("id", a.id);
                    }}
                  />
                </div>
                <div className="md:col-span-3">
                  <label className="text-xs text-gray-600">Description</label>
                  <Textarea
                    rows={2}
                    value={a.description ?? ""}
                    onChange={async (e) => {
                      const description = e.target.value;
                      setAgenda((prev) => prev.map((x) => (x.id === a.id ? { ...x, description } : x)));
                      await sb.from("meeting_agenda_items").update({ description }).eq("id", a.id);
                    }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </Modal>

      {/* Recording Modal */}
      <Modal
        open={recOpen}
        title="Meeting recording"
        onClose={() => setRecOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRecOpen(false)}>
              Close
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="text-sm text-gray-600">
            This uses your mic to record audio, uploads to Supabase Storage, then (if configured) calls OpenAI to
            transcribe and summarize into agenda notes.
          </div>
          <div className="flex items-center gap-2">
            <Pill>{isRecording ? "Recording" : "Idle"}</Pill>
            <Pill>{Math.floor(recSeconds / 60)}:{String(recSeconds % 60).padStart(2, "0")}</Pill>
          </div>
          <div className="flex gap-2">
            {!isRecording ? (
              <Button onClick={startRecording}>Start</Button>
            ) : (
              <Button onClick={stopRecordingAndUpload} disabled={recBusy}>
                {recBusy ? "Uploading..." : "Stop + Upload"}
              </Button>
            )}
          </div>
          {recErr && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">{recErr}</div>}
          <div className="text-xs text-gray-500">
            Storage bucket required: <b>recordings</b> (private). We’ll lock down policies in Supabase.
          </div>
        </div>
      </Modal>
    </div>
  );
}
