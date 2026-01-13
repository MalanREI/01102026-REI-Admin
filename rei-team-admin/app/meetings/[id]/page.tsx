"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { supabaseBrowser } from "@/src/lib/supabase/browser";
import { Button, Card, Input, Modal, Pill, Textarea } from "@/src/components/ui";
import { prettyDate } from "@/src/lib/format";
import { PageShell } from "@/src/components/PageShell";
import ResizableSidebar from "@/src/components/ResizableSidebar";

type Meeting = {
  id: string;
  title: string;
  location: string | null;
  start_at: string;
  duration_minutes: number;
  rrule: string | null;
  minutes_reminder_frequency?: "none" | "daily" | "weekly" | null;
};

type Profile = { id: string; full_name: string | null; email?: string | null; color_hex: string | null };

type Column = { id: string; name: string; position: number };

type StatusOpt = { id: string; name: string; position: number };

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

type AgendaItem = {
  id: string;
  code: string | null;
  title: string;
  description: string | null;
  position: number;
};

type MinutesSession = { id: string; started_at: string; ended_at: string | null };

type TaskEvent = {
  id: string;
  event_type: string;
  payload: any;
  created_at: string;
  created_by?: string | null;
};

type LatestEventMap = Record<string, TaskEvent | undefined>;

function sortByPos<T extends { position: number }>(arr: T[]): T[] {
  return [...arr].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
}

function toISODate(d: string | null): string {
  return d ? d : "";
}

function DroppableColumn({ id, children }: { id: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={["rounded-2xl border bg-gray-50 p-3 min-h-[200px]", isOver ? "ring-2 ring-gray-300" : ""].join(
        " "
      )}
    >
      {children}
    </div>
  );
}

function DraggableTaskCard({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.65 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
      {children}
    </div>
  );
}

export default function MeetingDetailPage() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const meetingId = params.id;

  const sb = useMemo(() => supabaseBrowser(), []);

  const minutesReferenceLink = (process.env.NEXT_PUBLIC_MINUTES_REFERENCE_LINK || "").trim();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [columns, setColumns] = useState<Column[]>([]);
  const [statuses, setStatuses] = useState<StatusOpt[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [agenda, setAgenda] = useState<AgendaItem[]>([]);
  const [currentSession, setCurrentSession] = useState<MinutesSession | null>(null);
  const [prevSession, setPrevSession] = useState<MinutesSession | null>(null);
  const [agendaNotes, setAgendaNotes] = useState<Record<string, string>>({});
  const [prevAgendaNotes, setPrevAgendaNotes] = useState<Record<string, string>>({});
  const [latestEventByTask, setLatestEventByTask] = useState<LatestEventMap>({});

  // UI toggles
  const [prevMeetingsOpen, setPrevMeetingsOpen] = useState(false);
  const [prevSessions, setPrevSessions] = useState<MinutesSession[]>([]);
  const [statusMgrOpen, setStatusMgrOpen] = useState(false);
  const [emailSettingsOpen, setEmailSettingsOpen] = useState(false);
  const [reminderFreq, setReminderFreq] = useState<
  "none" | "daily" | "weekdays" | "weekly" | "biweekly" | "monthly"
>("weekly");

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
  const [titleEditMode, setTitleEditMode] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Agenda edit
  const [agendaOpen, setAgendaOpen] = useState(false);

  // Recording
  const [recOpen, setRecOpen] = useState(false);
  const [recMin, setRecMin] = useState(true);
  const [recBusy, setRecBusy] = useState(false);
  const [recErr, setRecErr] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);
  const [lastRecordingPath, setLastRecordingPath] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const tickRef = useRef<number | null>(null);

  function ownerColor(ownerId: string | null): string {
    if (!ownerId) return "#E5E7EB";
    const p = profiles.find((x) => x.id === ownerId);
    return p?.color_hex || "#E5E7EB";
  }

function firstNameFromFullName(fullName: string | null | undefined): string | null {
  const s = (fullName ?? "").trim();
  if (!s) return null;
  const parts = s.split(/\s+/).filter(Boolean);
  return parts[0] ?? null;
}

function firstNameFromEmail(email: string | null | undefined): string | null {
  const s = (email ?? "").trim();
  if (!s || !s.includes("@")) return null;
  const local = s.split("@")[0] ?? "";
  const cleaned = local.replace(/[._-]+/g, " ").trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  const guess = parts[0] ?? null;
  if (!guess) return null;
  return guess.charAt(0).toUpperCase() + guess.slice(1);
}

function profileName(userId: string | null | undefined): string {
  if (!userId) return "Unknown";
  const p = profiles.find((x) => x.id === userId);

  const fn = firstNameFromFullName(p?.full_name);
  if (fn) return fn;

  const fe = firstNameFromEmail(p?.email);
  if (fe) return fe;

  return "Unknown";
}


  async function loadAgendaNotes(sessionId: string, isCurrent: boolean) {
    const n = await sb.from("meeting_agenda_notes").select("agenda_item_id,notes").eq("session_id", sessionId);
    if (n.error) return;
    const map: Record<string, string> = {};
    for (const row of n.data ?? []) {
      map[(row as any).agenda_item_id] = (row as any).notes ?? "";
    }
    if (isCurrent) setAgendaNotes(map);
    else setPrevAgendaNotes(map);
  }

  async function loadLatestEvents(taskIds: string[]) {
    if (taskIds.length === 0) {
      setLatestEventByTask({});
      return;
    }
    const ev = await sb
      .from("meeting_task_events")
      .select("id,task_id,event_type,payload,created_at,created_by")
      .in("task_id", taskIds)
      .order("created_at", { ascending: false });
    if (ev.error) return;

    const latest: LatestEventMap = {};
    for (const row of ev.data ?? []) {
      const taskId = (row as any).task_id as string;
      if (!latest[taskId]) latest[taskId] = row as any;
    }
    setLatestEventByTask(latest);
  }

  async function ensureDefaultStatuses(meetingId: string) {
    const s = await sb
      .from("meeting_task_statuses")
      .select("id,name,position")
      .eq("meeting_id", meetingId)
      .order("position", { ascending: true });

    if (!s.error && (s.data?.length ?? 0) > 0) {
      setStatuses((s.data ?? []) as any);
      return;
    }

    const seed = [
      { meeting_id: meetingId, name: "In Progress", position: 1 },
      { meeting_id: meetingId, name: "Needs Review", position: 2 },
      { meeting_id: meetingId, name: "Waiting", position: 3 },
      { meeting_id: meetingId, name: "Completed", position: 4 },
    ];
    {
  const ins = await sb.from("meeting_task_statuses").insert(seed);
  // ignore if table doesn't exist yet / RLS / duplicates
  if (ins.error) {
    // no-op
  }
}

    const again = await sb
      .from("meeting_task_statuses")
      .select("id,name,position")
      .eq("meeting_id", meetingId)
      .order("position", { ascending: true });

    if (!again.error) setStatuses((again.data ?? []) as any);

  }

  async function loadAll() {
    const m = await sb
      .from("meetings")
      .select("id,title,location,start_at,duration_minutes,rrule")
      .eq("id", meetingId)
      .single();
    if (m.error) throw m.error;
    setMeeting(m.data as any);

    const pr = await sb
      .from("profiles")
      .select("id,full_name,email,color_hex")
      .order("created_at", { ascending: true });
    if (!pr.error) setProfiles((pr.data ?? []) as any);

    const c = await sb
      .from("meeting_task_columns")
      .select("id,name,position")
      .eq("meeting_id", meetingId)
      .order("position", { ascending: true });
    if (c.error) throw c.error;
    setColumns((c.data ?? []) as any);

    await ensureDefaultStatuses(meetingId);

    const t = await sb
      .from("meeting_tasks")
      .select("id,column_id,title,status,priority,owner_id,start_date,due_date,notes,position,updated_at")
      .eq("meeting_id", meetingId)
      .order("position", { ascending: true });
    if (t.error) throw t.error;
    const taskRows = (t.data ?? []) as any as Task[];
    setTasks(taskRows);
    await loadLatestEvents(taskRows.map((x) => x.id));

    const a = await sb
      .from("meeting_agenda_items")
      .select("id,code,title,description,position")
      .eq("meeting_id", meetingId)
      .order("position", { ascending: true });
    if (a.error) throw a.error;
    setAgenda((a.data ?? []) as any);

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

    if (sessions[0]?.id) await loadAgendaNotes(sessions[0].id, true);
    if (sessions[1]?.id) await loadAgendaNotes(sessions[1].id, false);

    const prevSessionId = search?.get("prevSessionId");
    if (prevSessionId) {
      await selectPreviousSession(prevSessionId);
    }
  }

  useEffect(() => {
    (async () => {
      try {
        await ensureSelfProfile();
        await loadAll();
      } catch (e: any) {
        setErr(e?.message ?? "Failed to load meeting");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingId]);


  async function ensureSelfProfile() {
  const { data: userData } = await sb.auth.getUser();
  const u = userData?.user;
  if (!u?.id) return;

  const fullName =
    (u.user_metadata as any)?.full_name ||
    (u.user_metadata as any)?.name ||
    (u.user_metadata as any)?.fullName ||
    null;

  await sb
    .from("profiles")
    .upsert(
      { id: u.id, email: u.email ?? null, full_name: fullName, updated_at: new Date().toISOString() } as any,
      { onConflict: "id" }
    );
}

  
  async function ensureCurrentSession() {
    if (currentSession && currentSession.ended_at === null) return currentSession;

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
      setRecMin(true);
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
      .upsert({
        session_id: currentSession.id,
        agenda_item_id: agendaItemId,
        notes,
        updated_at: new Date().toISOString(),
      });
  }

  async function renameColumn(columnId: string, name: string) {
    setColumns((prev) => prev.map((c) => (c.id === columnId ? { ...c, name } : c)));
    await sb.from("meeting_task_columns").update({ name }).eq("id", columnId);
  }

  const cols = sortByPos(columns);
  const statusOpts = sortByPos(statuses);

  function openNewTask(colId: string) {
    setEditingTaskId(null);
    setTColumnId(colId);
    setTTitle("");
    setTStatus(statusOpts[0]?.name ?? "In Progress");
    setTPriority("Normal");
    setTOwner("");
    setTStart("");
    setTDue("");
    setTNotes("");
    setTEvents([]);
    setCommentText("");
    setTitleEditMode(true);
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
    setTitleEditMode(false);
    setCommentText("");

    const ev = await sb
      .from("meeting_task_events")
      .select("id,event_type,payload,created_at,created_by")
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

  async function refreshLatestForTask(taskId: string) {
    const ev = await sb
      .from("meeting_task_events")
      .select("id,event_type,payload,created_at,created_by")
      .eq("task_id", taskId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    if (!ev.error) setLatestEventByTask((m) => ({ ...m, [taskId]: ev.data as any }));
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
        await refreshLatestForTask(newTask.id);
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
          await refreshLatestForTask(after.id);
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
      setLatestEventByTask((m) => {
        const copy = { ...m };
        delete copy[editingTaskId];
        return copy;
      });

      setTaskOpen(false);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to delete task");
    } finally {
      setBusy(false);
    }
  }

  async function addComment() {
    if (!editingTaskId) return;
    const text = commentText.trim();
    if (!text) return;

    setBusy(true);
    try {
      await writeTaskEvent(editingTaskId, "comment", { text });
      setCommentText("");
      const ev = await sb
        .from("meeting_task_events")
        .select("id,event_type,payload,created_at,created_by")
        .eq("task_id", editingTaskId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (!ev.error) setTEvents((ev.data ?? []) as any);
      await refreshLatestForTask(editingTaskId);
    } finally {
      setBusy(false);
    }
  }

  async function onDragEnd(ev: DragEndEvent) {
    const activeId = String(ev.active.id);
    const overId = ev.over ? String(ev.over.id) : null;
    if (!overId) return;

    const task = tasks.find((t) => t.id === activeId);
    if (!task) return;
    if (task.column_id === overId) return;

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
      await refreshLatestForTask(activeId);
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

      mr.start(1000);
      mediaRecorderRef.current = mr;

      setIsRecording(true);
      setRecSeconds(0);

      tickRef.current = window.setInterval(() => {
        setRecSeconds((s) => {
          const next = s + 1;
          if (next >= 7200) setTimeout(() => stopRecordingAndUpload(), 0);
          return next;
        });
      }, 1000);

      setRecMin(true);
    } catch (e: any) {
      setRecErr(e?.message ?? "Could not start recording");
    }
  }

  async function stopRecordingAndUpload(): Promise<{ recordingPath: string } | null> {
    if (!mediaRecorderRef.current) return null;
    setRecBusy(true);
    setRecErr(null);

    try {
      const mr = mediaRecorderRef.current;

      // Wait for the "stop" event so the last chunk flushes before we build the blob.
      const stopped = new Promise<void>((resolve) => {
        const prev = mr.onstop;
        // Use a function (not an arrow) and call the previous handler with the correct `this`
        // to satisfy TS' MediaRecorder event handler typing.
        mr.onstop = function (ev: Event) {
          try {
            if (typeof prev === "function") prev.call(mr, ev);
          } finally {
            resolve();
          }
        };
      });

      mr.stop();
      await stopped;

      mediaRecorderRef.current = null;
      setIsRecording(false);
      if (tickRef.current) window.clearInterval(tickRef.current);

      const blob = new Blob(chunksRef.current, { type: "audio/webm" });

      // Upload recording through the server route (so buckets are env-configured)
      const form = new FormData();
      form.append("meetingId", meetingId);
      form.append("sessionId", currentSession!.id);
      form.append("durationSeconds", String(recSeconds));
      // Best-effort userId (server route accepts missing userId as well).
      try {
        const u = await sb.auth.getUser();
        const uid = u.data?.user?.id || "";
        if (uid) form.append("userId", uid);
      } catch {
        // ignore
      }
      form.append("file", blob, "recording.webm");

      const upRes = await fetch("/api/meetings/ai/upload-recording", { method: "POST", body: form });
      const upJson = await upRes.json().catch(() => ({} as any));
      if (!upRes.ok) throw new Error(upJson?.error || "Recording upload failed");

      const rp = String(upJson?.recordingPath || "");
      if (!rp) throw new Error("Recording upload failed (no path returned)");

      setLastRecordingPath(rp);
      setRecMin(true);

      return { recordingPath: rp };
    } catch (e: any) {
      setRecErr(e?.message ?? "Upload failed");
      return null;
    } finally {
      setRecBusy(false);
    }
  }

  async function concludeMeeting() {
  if (!currentSession?.id) return;
  setBusy(true);
  setErr(null);
  try {
    let recordingPath: string | null = lastRecordingPath;

    if (isRecording) {
      const up = await stopRecordingAndUpload();
      recordingPath = up?.recordingPath ?? null;
    }

    const res = await fetch("/api/meetings/ai/conclude", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        meetingId,
        sessionId: currentSession.id,
        recordingPath,
        referenceLink: minutesReferenceLink || null,
      }),
    });

    const j = await res.json().catch(() => ({} as any));
    if (!res.ok) throw new Error(j?.error || "Failed to conclude meeting");

    const s = await sb
      .from("meeting_minutes_sessions")
      .select("id,started_at,ended_at,pdf_path")
      .eq("meeting_id", meetingId)
      .order("started_at", { ascending: false });

    if (!s.error) {
      const sessions = (s.data as any[]) ?? [];
      const current = sessions.find((x) => !x.ended_at) ?? null;
      const prev = sessions.find((x) => !!x.ended_at) ?? null;
      setCurrentSession(current);
      setPrevSession(prev);
      setPrevSessions(sessions.filter((x) => !!x.ended_at));
    }

    // AI minutes + PDF generation runs asynchronously in Supabase.
    // Poll until processed so the UI updates automatically.
    const pollSessionId = currentSession.id;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    for (let i = 0; i < 30; i++) {
      const st = await sb
        .from("meeting_minutes_sessions")
        .select("id,ai_status,ai_error,pdf_path")
        .eq("id", pollSessionId)
        .maybeSingle();

      if (!st.error && st.data) {
        const status = String((st.data as any).ai_status ?? "");
        const pdfPath = String((st.data as any).pdf_path ?? "");
        const aiError = String((st.data as any).ai_error ?? "");

        if (status === "done") {
          await loadAgendaNotes(pollSessionId, true);
          // Refresh session lists to pick up pdf_path
          const s2 = await sb
            .from("meeting_minutes_sessions")
            .select("id,started_at,ended_at,pdf_path")
            .eq("meeting_id", meetingId)
            .order("started_at", { ascending: false });
          if (!s2.error) {
            const sessions2 = (s2.data as any[]) ?? [];
            const current2 = sessions2.find((x) => !x.ended_at) ?? null;
            const prev2 = sessions2.find((x) => !!x.ended_at) ?? null;
            setCurrentSession(current2);
            setPrevSession(prev2);
            setPrevSessions(sessions2.filter((x) => !!x.ended_at));
          }
          // If PDF is ready, stop polling.
          if (pdfPath) break;
        }

        if (status === "error") {
          setErr(aiError || "AI processing failed");
          break;
        }
      }

      await sleep(4000);
    }
  } catch (e: any) {
    setErr(e?.message ?? "Failed to conclude meeting");
  } finally {
    setBusy(false);
  }
}

  async function loadPreviousSessions() {
    const s = await sb
      .from("meeting_minutes_sessions")
      .select("id,started_at,ended_at")
      .eq("meeting_id", meetingId)
      .order("started_at", { ascending: false })
      .limit(50);
    if (!s.error) setPrevSessions((s.data ?? []) as any);
  }

    async function openSessionPdf(sessionId: string) {
    try {
      const res = await fetch("/api/meetings/ai/session-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      const j = await res.json().catch(() => ({} as any));
      if (!res.ok) throw new Error(j?.error || "Failed to get PDF");
      if (j?.url) window.open(j.url, "_blank", "noopener,noreferrer");
    } catch (e: any) {
      alert(e?.message ?? "Failed to open PDF");
    }
  }

async function selectPreviousSession(sessionId: string) {
    const s = await sb
      .from("meeting_minutes_sessions")
      .select("id,started_at,ended_at")
      .eq("id", sessionId)
      .single();
    if (!s.error) setPrevSession(s.data as any);
    await loadAgendaNotes(sessionId, false);
    setPrevMeetingsOpen(false);
  }

  async function saveReminderSettings() {
    if (!meeting) return;
    setBusy(true);
    try {
  const up = await sb
    .from("meeting_email_settings")
    .upsert(
      { meeting_id: meetingId, reminder_frequency: reminderFreq, updated_at: new Date().toISOString() },
      { onConflict: "meeting_id" }
    );

  // ignore if table not migrated yet / RLS / etc.
  if (up.error) {
    // no-op
}

      setEmailSettingsOpen(false);
    } finally {
      setBusy(false);
    }
  }

  async function loadReminderSettings() {
    const r = await sb.from("meeting_email_settings").select("reminder_frequency").eq("meeting_id", meetingId).single();
    if (!r.error && (r.data as any)?.reminder_frequency) setReminderFreq(((r.data as any).reminder_frequency as any) ?? "weekly");
  }

  async function addStatus(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    const maxPos = Math.max(0, ...statusOpts.map((s) => s.position ?? 0));
    const ins = await sb.from("meeting_task_statuses").insert({ meeting_id: meetingId, name: trimmed, position: maxPos + 1 }).select("id,name,position").single();
    if (!ins.error) setStatuses((prev) => [...prev, ins.data as any]);
  }

  async function updateStatus(id: string, name: string) {
    setStatuses((prev) => prev.map((s) => (s.id === id ? { ...s, name } : s)));
    await sb.from("meeting_task_statuses").update({ name }).eq("id", id);
  }

  async function deleteStatus(id: string) {
    const statusName = statuses.find((s) => s.id === id)?.name;
    if (!statusName) return;
    const used = tasks.some((t) => t.status === statusName);
    if (used) {
      alert("That status is currently used by at least one task. Change those tasks first.");
      return;
    }
    await sb.from("meeting_task_statuses").delete().eq("id", id);
    setStatuses((prev) => prev.filter((s) => s.id !== id));
    } 
  useEffect(() => {
    void loadReminderSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingId]);

  return (
    <PageShell>
      {!meeting ? (
        <div className="text-sm text-gray-600">Loading...</div>
      ) : (
        <div className="space-y-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold">{meeting.title}</h1>
              <div className="text-sm text-gray-600">
                {prettyDate(meeting.start_at)} • {meeting.duration_minutes} min
                {meeting.location ? ` • ${meeting.location}` : ""}
              </div>
              {meeting.rrule && <div className="text-xs text-gray-500 mt-1">Recurring: {meeting.rrule}</div>}
              {isRecording && (
                <div className="mt-2">
                  <button
                    className="text-xs rounded-full border bg-white px-2 py-1 hover:bg-gray-50"
                    onClick={() => setRecOpen(true)}
                  >
                    ● Recording… click to open controls
                  </button>
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-2 justify-end">
              <Button variant="ghost" onClick={() => setAgendaOpen(true)}>
                Edit agenda
              </Button>
              <Button variant="ghost" onClick={() => { setStatusMgrOpen(true); }}>
                Statuses
              </Button>
              <Button variant="ghost" onClick={() => setEmailSettingsOpen(true)}>
                Email settings
              </Button>
              <Button onClick={onNewMinutes} disabled={busy}>
                New meeting minutes
              </Button>
              <Button variant="ghost" onClick={concludeMeeting} disabled={busy}>
                Conclude meeting
              </Button>
              <Button
                variant="ghost"
                onClick={async () => {
                  await loadPreviousSessions();
                  setPrevMeetingsOpen(true);
                }}
              >
                View Previous Meetings
              </Button>
            </div>
          </div>

          {err && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">{err}</div>}

          <ResizableSidebar
            storageKey={`meetings:${meetingId}:agenda`}
            defaultWidth={420}
            minWidth={300}
            maxWidth={620}
            collapsedWidth={56}
            sidebar={
              <div className="space-y-6">
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
            }
          >
            <div className="space-y-6">
<Card
                title="Tasks Board"
                right={<div className="text-xs text-gray-500">Drag cards between columns • Scroll horizontally if needed</div>}
              >
                <DndContext sensors={sensors} onDragEnd={onDragEnd}>
                  <div className="overflow-x-auto overflow-y-hidden max-w-full">
                    <div
                      className="grid gap-4 min-w-max"
                      style={{ gridTemplateColumns: `repeat(${Math.max(cols.length, 1)}, 280px)` }}
                    >
                      {cols.map((c) => (
                        <DroppableColumn key={c.id} id={c.id}>
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <Input
                              value={c.name}
                              onChange={(e) => {
                                const name = e.target.value;
                                setColumns((prev) => prev.map((x) => (x.id === c.id ? { ...x, name } : x)));
                              }}
                              onBlur={async (e) => {
                                await renameColumn(c.id, e.target.value);
                              }}
                            />
                            <Button variant="ghost" onClick={() => openNewTask(c.id)}>
                              +
                            </Button>
                          </div>

                          <div className="space-y-2">
                            {sortByPos(tasks.filter((t) => t.column_id === c.id)).map((t) => {
                              const le = latestEventByTask[t.id];
                              return (
                                <DraggableTaskCard key={t.id} id={t.id}>
                                  <div
                                    className="rounded-xl border bg-white p-3 cursor-pointer select-none"
                                    style={{ borderLeft: `6px solid ${ownerColor(t.owner_id)}` }}
                                    onClick={() => openEditTask(t.id)}
                                  >
                                    <div className="text-sm font-semibold">{t.title}</div>
                                    <div className="mt-1 flex flex-wrap gap-2">
                                      <Pill>{t.status}</Pill>
                                      <Pill>{t.priority}</Pill>
                                      {t.due_date && <Pill>Due {t.due_date}</Pill>}
                                    </div>

                                    {le && (
                                      <div className="mt-2 text-xs text-gray-500">
                                        Updated {prettyDate(le.created_at)} by {profileName(le.created_by ?? null)}
                                      </div>
                                    )}
                                  </div>
                                </DraggableTaskCard>
                              );
                            })}
                          </div>
                        </DroppableColumn>
                      ))}
                    </div>
                  </div>
                </DndContext>
              </Card>
            </div>
          </ResizableSidebar>

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
            <div className="max-h-[70vh] overflow-auto pr-1">
              <div className="space-y-4">
              <div className="rounded-xl border p-3">
                {!titleEditMode ? (
                  <div className="relative">
                    <div className="text-center text-xl md:text-2xl font-semibold leading-tight tracking-tight text-gray-900">
                      {tTitle || "Untitled task"}
                    </div>
                    <button
                      className="absolute right-0 top-0 rounded-lg border px-2 py-1 text-sm hover:bg-gray-50"
                      onClick={() => setTitleEditMode(true)}
                      aria-label="Edit title"
                      type="button"
                    >
                      ✎
                    </button>
                  </div>
                ) : (
                  <div className="grid gap-2">
                    <label className="text-xs text-gray-600">Title</label>
                    <Input
                      value={tTitle}
                      onChange={(e) => setTTitle(e.target.value)}
                      onBlur={() => setTitleEditMode(false)}
                      autoFocus
                    />
                    <div className="text-xs text-gray-500">Click outside the field to finish editing.</div>
                  </div>
                )}
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="text-xs text-gray-600">Status</label>
                  <select
                    className="w-full rounded-lg border px-3 py-2 text-sm"
                    value={tStatus}
                    onChange={(e) => setTStatus(e.target.value)}
                  >
                    {statusOpts.length ? (
                      statusOpts.map((s) => (
                        <option key={s.id} value={s.name}>
                          {s.name}
                        </option>
                      ))
                    ) : (
                      <>
                        <option>In Progress</option>
                        <option>Needs Review</option>
                        <option>Waiting</option>
                        <option>Completed</option>
                      </>
                    )}
                  </select>
                </div>

                <div>
                  <label className="text-xs text-gray-600">Priority</label>
                  <select
                    className="w-full rounded-lg border px-3 py-2 text-sm"
                    value={tPriority}
                    onChange={(e) => setTPriority(e.target.value)}
                  >
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
                        {p.full_name?.trim() || p.email?.trim() || "Unknown"}
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

                {editingTaskId && (
                  <div className="md:col-span-2">
                    <label className="text-xs text-gray-600">Add comment</label>
                    <div className="grid gap-2">
                      <Textarea rows={3} value={commentText} onChange={(e) => setCommentText(e.target.value)} placeholder="Type a comment..." />
                      <div className="flex justify-end">
                        <Button variant="ghost" onClick={addComment} disabled={busy || !commentText.trim()}>
                          Comment
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
             {editingTaskId && (
              <div>
                <div className="text-sm font-semibold mb-2">Activity log</div>
            
                <div className="max-h-56 overflow-auto rounded-xl border bg-gray-50">
                  {tEvents.length === 0 ? (
                    <div className="p-3 text-sm text-gray-600">No events yet.</div>
                  ) : (
                    <div className="divide-y">
                      {tEvents.map((e) => (
                        <div key={e.id} className="p-3 text-sm">
                          <div className="flex items-center justify-between">
                            <div className="font-medium">
                              {e.event_type}{" "}
                              <span className="text-xs text-gray-500 font-normal">
                                by {profileName(e.created_by ?? null)}
                              </span>
                            </div>
            
                            <div className="text-xs text-gray-500">
                              {prettyDate(e.created_at)}
                            </div>
                          </div>
            
                          {e.event_type === "comment" ? (
                            <div className="mt-2 text-sm text-gray-800 whitespace-pre-wrap">
                              {e.payload?.text ?? ""}
                            </div>
                          ) : (
                            <pre className="mt-2 text-xs text-gray-700 whitespace-pre-wrap">
                              {JSON.stringify(e.payload, null, 2)}
                            </pre>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
      </div>  {/* closes space-y-4 */}
    </div>    {/* closes max-h-[70vh] wrapper */}
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

            <div className="text-sm text-gray-600 mb-3">Edit agenda topic fields below. (Next: drag reorder + add/remove.)</div>

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

          {/* Previous meetings modal */}
          <Modal
            open={prevMeetingsOpen}
            title="Previous meetings"
            onClose={() => setPrevMeetingsOpen(false)}
            footer={
              <Button variant="ghost" onClick={() => setPrevMeetingsOpen(false)}>
                Close
              </Button>
            }
          >
            <div className="space-y-2">
              {prevSessions.length === 0 ? (
                <div className="text-sm text-gray-600">No previous sessions found.</div>
              ) : (
                prevSessions.map((s) => (
                  <button
                    key={s.id}
                    className="w-full text-left rounded-xl border p-3 hover:bg-gray-50"
                    onClick={() => selectPreviousSession(s.id)}
                    type="button"
                  >
                    <div className="font-semibold">{prettyDate(s.started_at)}</div>
                    <div className="text-xs text-gray-600">
                      {s.ended_at ? `Ended ${prettyDate(s.ended_at)}` : "(In progress / not concluded)"}
                    </div>
                    <div className="text-xs text-gray-500 mt-1 flex items-center justify-between">
                      <span />
                      <button
                        type="button"
                        className="text-xs underline underline-offset-2 hover:opacity-80"
                        onClick={(e) => {
                          e.stopPropagation();
                          void openSessionPdf(s.id);
                        }}
                      >
                        Link
                      </button>
                    </div>
                  </button>
                ))
              )}
            </div>
          </Modal>

          {/* Status manager modal */}
          <Modal
            open={statusMgrOpen}
            title="Task Statuses"
            onClose={() => setStatusMgrOpen(false)}
            footer={
              <Button variant="ghost" onClick={() => setStatusMgrOpen(false)}>
                Close
              </Button>
            }
          >
            <div className="text-sm text-gray-600 mb-3">
              This controls the list of Status values available for tasks in this meeting.
            </div>

            <div className="space-y-3">
              {statusOpts.map((s) => (
                <div key={s.id} className="flex items-center gap-2">
                  <Input value={s.name} onChange={(e) => updateStatus(s.id, e.target.value)} />
                  <Button variant="ghost" onClick={() => deleteStatus(s.id)}>
                    Delete
                  </Button>
                </div>
              ))}

              <AddStatusRow onAdd={addStatus} />
            </div>
          </Modal>

          {/* Email settings modal */}
          <Modal
            open={emailSettingsOpen}
            title="Email reminders"
            onClose={() => setEmailSettingsOpen(false)}
            footer={
              <>
                <Button variant="ghost" onClick={() => setEmailSettingsOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={saveReminderSettings} disabled={busy}>
                  Save
                </Button>
              </>
            }
          >
            <div className="space-y-3">
              <div className="text-sm text-gray-600">
                Choose how often the system should email reminders to attendees. If a minutes PDF exists for the latest concluded session, the email can include the PDF link.
                (This requires Vercel Cron + SMTP, and the Supabase migration included below.)
              </div>

              <div>
                <label className="text-xs text-gray-600">Reminder frequency</label>
                <select
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                  value={reminderFreq}
                  onChange={(e) => setReminderFreq(e.target.value as any)}
                >
                  <option value="none">None</option>
                  <option value="daily">Daily</option>
                  <option value="weekdays">Weekdays (Mon–Fri)</option>
                  <option value="weekly">Weekly</option>
                  <option value="biweekly">Every 2 weeks</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>
            </div>
          </Modal>

          {/* Recording controls modal */}
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
              <div className="flex items-center justify-between">
                <div className="text-sm text-gray-700">
                  {currentSession ? (
                    <>
                      Session started: <span className="font-semibold">{prettyDate(currentSession.started_at)}</span>
                      {currentSession.ended_at ? (
                        <span className="ml-2 text-xs text-gray-500">(Ended)</span>
                      ) : null}
                    </>
                  ) : (
                    "No active minutes session."
                  )}
                </div>

                <Button variant="ghost" onClick={() => setRecMin((v) => !v)}>
                  {recMin ? "Expand" : "Collapse"}
                </Button>
              </div>

              {recMin ? (
                <div className="text-sm text-gray-600">Collapsed. Expand to start/stop recording.</div>
              ) : (
                <div className="space-y-3">
                  <div className="rounded-xl border p-3 bg-gray-50">
                    <div className="text-sm">Duration: {Math.floor(recSeconds / 60)}m {recSeconds % 60}s</div>
                    <div className="text-xs text-gray-500">Auto-stops at 2 hours.</div>
                  </div>

                  <div className="flex gap-2">
                    {!isRecording ? (
                      <Button onClick={startRecording} disabled={!currentSession || !!currentSession.ended_at || recBusy}>
                        Start recording
                      </Button>
                    ) : (
                      <Button onClick={stopRecordingAndUpload} disabled={recBusy}>
                        {recBusy ? "Uploading..." : "Stop + Upload"}
                      </Button>
                    )}
                  </div>

                  {recErr && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">{recErr}</div>}
                </div>
              )}
            </div>
          </Modal>
        </div>
      )}
    </PageShell>
  );
}

function AddStatusRow({ onAdd }: { onAdd: (name: string) => void }) {
  const [name, setName] = useState("");
  return (
    <div className="flex items-center gap-2">
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Add a new status..." />
      <Button
        variant="ghost"
        onClick={() => {
          const v = name.trim();
          if (!v) return;
          onAdd(v);
          setName("");
        }}
      >
        Add
      </Button>
    </div>
  );
}
