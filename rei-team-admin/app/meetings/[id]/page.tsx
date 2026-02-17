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
import { Button, Card, Input, Modal, Pill, Textarea, Dropdown, MultiSelectDropdown } from "@/src/components/ui";
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

type Attendee = { email: string; full_name: string | null; user_id: string | null; color_hex?: string | null };

type Column = { id: string; name: string; position: number };

type StatusOpt = { id: string; name: string; position: number; color_hex?: string | null };

type PriorityOpt = { id: string; name: string; position: number; color_hex?: string | null };

type Task = {
  id: string;
  column_id: string;
  title: string;
  status: string;
  priority: string;
  owner_id: string | null;
  owner_email?: string | null;
  owner_name?: string | null;
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

type MinutesSession = {
  id: string;
  started_at: string;
  ended_at: string | null;
  pdf_path?: string | null;
  ai_status?: string | null;
  ai_error?: string | null;
};

type TaskEvent = {
  id: string;
  event_type: string;
  payload: any;
  created_at: string;
  created_by?: string | null;
};

type Milestone = {
  id: string;
  title: string;
  description: string | null;
  target_date: string | null;
  status: string;
  priority: string;
  owner_id: string | null;
  owner_email?: string | null;
  owner_name?: string | null;
  position: number;
  updated_at: string;
};

type OngoingNote = {
  id: string;
  title: string;
  content: string | null;
  category: string | null;
  position: number;
  updated_at: string;
};

type LatestEventMap = Record<string, TaskEvent | undefined>;

function safeStr(v: any): string {
  if (v === null || v === undefined) return "";
  return String(v);
}

function shortValue(v: any): string {
  const s = safeStr(v).trim();
  if (!s) return "(blank)";
  if (s.length <= 80) return s;
  return s.slice(0, 79) + "…";
}

function humanizeField(field: string): string {
  return field
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function eventSummaryLines(e: TaskEvent): string[] {
  const t = (e.event_type || "").toLowerCase();
  const p = e.payload || {};

  if (t === "comment") {
    const text = safeStr(p?.text).trim();
    return text ? [text] : ["(empty comment)"];
  }

  if (t === "created") {
    const title = safeStr(p?.title).trim();
    return [title ? `Created: ${title}` : "Created task"];
  }

  if (t === "deleted") return ["Deleted task"]; 

  if (t === "moved") {
    const from = shortValue(p?.from);
    const to = shortValue(p?.to);
    return [`Moved: ${from} → ${to}`];
  }

  if (t === "updated") {
    const changes = p?.changes && typeof p.changes === "object" ? p.changes : null;
    if (!changes) return ["Updated task"]; 
    const lines: string[] = [];
    for (const [k, v] of Object.entries(changes)) {
      const from = shortValue((v as any)?.from);
      const to = shortValue((v as any)?.to);
      lines.push(`${humanizeField(k)}: ${from} → ${to}`);
    }
    return lines.length ? lines : ["Updated task"]; 
  }

  // fallback
  try {
    const j = JSON.stringify(p, null, 2);
    return j ? [j] : ["(no details)"];
  } catch {
    return ["(unreadable payload)"];
  }
}

function sortByPos<T extends { position: number }>(arr: T[]): T[] {
  return [...arr].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
}

function sortTasksByDueDate<T extends { due_date: string | null; position: number; updated_at?: string; id?: string }>(arr: T[]): T[] {
  return [...arr].sort((a, b) => {
    // Sort by due_date ascending, nulls last
    if (a.due_date && !b.due_date) return -1;
    if (!a.due_date && b.due_date) return 1;
    if (a.due_date && b.due_date) {
      const dateComp = a.due_date.localeCompare(b.due_date);
      if (dateComp !== 0) return dateComp;
    }
    // Tie-breaker: position, then updated_at, then id
    if ((a.position ?? 0) !== (b.position ?? 0)) {
      return (a.position ?? 0) - (b.position ?? 0);
    }
    if (a.updated_at && b.updated_at) {
      const updComp = b.updated_at.localeCompare(a.updated_at); // Descending (newest first)
      if (updComp !== 0) return updComp;
    }
    if (a.id && b.id) {
      return a.id.localeCompare(b.id);
    }
    return 0;
  });
}

function sortMilestonesByTargetDate<T extends { target_date: string | null; position: number; updated_at?: string; id?: string }>(arr: T[]): T[] {
  return [...arr].sort((a, b) => {
    // Sort by target_date ascending, nulls last
    if (a.target_date && !b.target_date) return -1;
    if (!a.target_date && b.target_date) return 1;
    if (a.target_date && b.target_date) {
      const dateComp = a.target_date.localeCompare(b.target_date);
      if (dateComp !== 0) return dateComp;
    }
    // Tie-breaker: position, then updated_at, then id
    if ((a.position ?? 0) !== (b.position ?? 0)) {
      return (a.position ?? 0) - (b.position ?? 0);
    }
    if (a.updated_at && b.updated_at) {
      const updComp = b.updated_at.localeCompare(a.updated_at);
      if (updComp !== 0) return updComp;
    }
    if (a.id && b.id) {
      return a.id.localeCompare(b.id);
    }
    return 0;
  });
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
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [columns, setColumns] = useState<Column[]>([]);
  const [statuses, setStatuses] = useState<StatusOpt[]>([]);
  const [priorities, setPriorities] = useState<PriorityOpt[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [ongoingNotes, setOngoingNotes] = useState<OngoingNote[]>([]);
  const [agenda, setAgenda] = useState<AgendaItem[]>([]);
  const [currentSession, setCurrentSession] = useState<MinutesSession | null>(null);
  const [prevSession, setPrevSession] = useState<MinutesSession | null>(null);
  const [agendaNotes, setAgendaNotes] = useState<Record<string, string>>({});
  const [prevAgendaNotes, setPrevAgendaNotes] = useState<Record<string, string>>({});
  const [latestEventByTask, setLatestEventByTask] = useState<LatestEventMap>({});

  // Kanban filters
  const [tasksCollapsed, setTasksCollapsed] = useState(false);
  const [milestonesCollapsed, setMilestonesCollapsed] = useState(false);
  const [notesCollapsed, setNotesCollapsed] = useState(false);

  // Advanced filtering for tasks
  const [taskFilterStatuses, setTaskFilterStatuses] = useState<Set<string>>(new Set());
  const [taskFilterOwners, setTaskFilterOwners] = useState<Set<string>>(new Set());
  const [taskFilterPriorities, setTaskFilterPriorities] = useState<Set<string>>(new Set());

  // Advanced filtering for milestones
  const [milestoneFilterStatuses, setMilestoneFilterStatuses] = useState<Set<string>>(new Set());
  const [milestoneFilterOwners, setMilestoneFilterOwners] = useState<Set<string>>(new Set());
  const [milestoneFilterPriorities, setMilestoneFilterPriorities] = useState<Set<string>>(new Set());

  // Advanced filtering for notes
  const [noteFilterCategories, setNoteFilterCategories] = useState<Set<string>>(new Set());

  // UI toggles
  const [prevMeetingsOpen, setPrevMeetingsOpen] = useState(false);
  const [sendNotesOpen, setSendNotesOpen] = useState(false);
  const [prevSessions, setPrevSessions] = useState<MinutesSession[]>([]);
  const [statusMgrOpen, setStatusMgrOpen] = useState(false);
  const [priorityMgrOpen, setPriorityMgrOpen] = useState(false);
  const [attendeesMgrOpen, setAttendeesMgrOpen] = useState(false);
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
  const [info, setInfo] = useState<string | null>(null);

  // Milestone modal
  const [milestoneOpen, setMilestoneOpen] = useState(false);
  const [editingMilestoneId, setEditingMilestoneId] = useState<string | null>(null);
  const [mTitle, setMTitle] = useState("");
  const [mDescription, setMDescription] = useState("");
  const [mTargetDate, setMTargetDate] = useState("");
  const [mStatus, setMStatus] = useState("Pending");
  const [mPriority, setMPriority] = useState("Normal");
  const [mOwner, setMOwner] = useState<string | "">("");

  // Ongoing Note modal
  const [noteOpen, setNoteOpen] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [nTitle, setNTitle] = useState("");
  const [nContent, setNContent] = useState("");
  const [nCategory, setNCategory] = useState("");

  // Note categories management
  const [noteCategoriesOpen, setNoteCategoriesOpen] = useState(false);
  const [noteCategories, setNoteCategories] = useState<string[]>([]);

  // Agenda edit
  const [agendaOpen, setAgendaOpen] = useState(false);

  // Board filters
  const [showCompleted, setShowCompleted] = useState(false);

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

  // Derive available note categories from existing notes + predefined categories
  const availableNoteCategories = useMemo(() => {
    const fromNotes = ongoingNotes
      .filter((n) => n.category)
      .map((n) => n.category!)
      .filter((c, i, arr) => arr.indexOf(c) === i); // unique
    const combined = [...new Set([...noteCategories, ...fromNotes])];
    return combined.sort();
  }, [noteCategories, ongoingNotes]);

  // Memoized filtered collections to avoid redundant filtering
  const filteredMilestones = useMemo(
    () => applyMilestoneFilters(milestones),
    [milestones, milestoneFilterStatuses, milestoneFilterOwners, milestoneFilterPriorities, attendees, priorities]
  );

  const filteredNotes = useMemo(
    () => applyNoteFilters(ongoingNotes),
    [ongoingNotes, noteFilterCategories, availableNoteCategories]
  );

  function ownerColor(ownerId: string | null): string {
    if (!ownerId) return "#E5E7EB";
    const p = profiles.find((x) => x.id === ownerId);
    return p?.color_hex || "#E5E7EB";
  }

  function attendeeColor(email: string | null): string {
    if (!email) return "#E5E7EB";
    const a = attendees.find((x) => x.email?.toLowerCase() === email.toLowerCase());
    return a?.color_hex || "#E5E7EB";
  }

  // Helper to get color for task/milestone owner
  function getOwnerColor(task: { owner_id: string | null; owner_email?: string | null }): string {
    if (task.owner_id) {
      return ownerColor(task.owner_id);
    }
    if (task.owner_email) {
      return attendeeColor(task.owner_email);
    }
    return "#E5E7EB";
  }

  function priorityColor(priority: string): string {
    const prio = priorities.find((p) => p.name === priority);
    if (prio && prio.color_hex) {
      return prio.color_hex;
    }
    // Fallback colors
    const p = priority.toLowerCase();
    if (p === "urgent") return "#DC2626"; // red-600
    if (p === "high") return "#EA580C"; // orange-600
    if (p === "normal") return "#2563EB"; // blue-600
    if (p === "low") return "#16A34A"; // green-600
    return "#6B7280"; // gray-500
  }

  function statusColor(statusName: string): string {
    const status = statuses.find((s) => s.name === statusName);
    if (status && (status as any).color_hex) {
      return (status as any).color_hex;
    }
    // Default colors based on common status names
    const s = statusName.toLowerCase();
    if (s.includes("complete")) return "#16A34A"; // green
    if (s.includes("progress") || s.includes("doing")) return "#2563EB"; // blue
    if (s.includes("review")) return "#EA580C"; // orange
    if (s.includes("wait")) return "#CA8A04"; // yellow
    return "#6B7280"; // gray
  }

  // Helper function to format owner for form display
  function formatOwnerForForm(ownerId: string | null | undefined, ownerEmail: string | null | undefined): string {
    if (ownerId) return ownerId;
    if (ownerEmail) return `email:${ownerEmail.toLowerCase()}`;
    return "";
  }

function toTitleCase(s: string) {
  return (s || "")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function nameFromEmail(email: string) {
  const local = (email || "").split("@")[0] || "";
  // alan.moore -> ["alan","moore"], alan_moore -> ["alan","moore"], alanmoore -> ["alanmoore"]
  const parts = local
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);

  if (!parts.length) return "Unassigned";

  const first = toTitleCase(parts[0]);
  const last = parts.length > 1 ? toTitleCase(parts[parts.length - 1]) : "";
  const lastInit = last ? `${last[0]}.` : "";

  return lastInit ? `${first} ${lastInit}` : first;
}

function formatAttendeeLabel(fullName: string | null | undefined, email: string) {
  const raw = (fullName || "").trim();

  // If they already entered "Alan M." or similar, keep it.
  if (raw && /^[A-Za-z]+(\s+[A-Za-z]\.)$/.test(raw)) return raw;

  // If we have a full name like "Alan Moore", convert to "Alan M."
  if (raw) {
    const parts = raw.split(/\s+/g).filter(Boolean);
    if (parts.length === 1) return toTitleCase(parts[0]);

    const first = toTitleCase(parts[0]);
    const last = toTitleCase(parts[parts.length - 1]);
    const lastInit = last ? `${last[0]}.` : "";
    return lastInit ? `${first} ${lastInit}` : first;
  }

  // Fallback: derive from email
  return nameFromEmail(email);
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
  if (!userId) return "Unknown User";
  
  // First try to find in profiles by id
  const p = profiles.find((x) => x.id === userId);
  if (p) {
    const fn = firstNameFromFullName(p.full_name);
    if (fn) return fn;
    
    const fe = firstNameFromEmail(p.email);
    if (fe) return fe;
  }

  // Try to find in attendees by user_id
  const attendee = attendees.find((a) => a.user_id === userId);
  if (attendee) {
    const aFn = firstNameFromFullName(attendee.full_name);
    if (aFn) return aFn;
    
    const aFe = firstNameFromEmail(attendee.email);
    if (aFe) return aFe;
    
    // Return email as fallback
    if (attendee.email) return attendee.email;
  }

  // Try to find in attendees by email (in case userId is actually an email)
  if (userId.includes("@")) {
    const attendeeByEmail = attendees.find((a) => a.email?.toLowerCase() === userId.toLowerCase());
    if (attendeeByEmail) {
      const aFn = firstNameFromFullName(attendeeByEmail.full_name);
      if (aFn) return aFn;
      
      return attendeeByEmail.email;
    }
  }

  // Return user ID as last resort instead of "Unknown"
  return userId.slice(0, 8) + "...";
}

function formatTaskEventLine(opts: { event: TaskEvent; columns: Column[] }): string {
  const e = opts.event;
  const p: any = e.payload || {};

  if (e.event_type === "created") {
    const title = String(p?.title ?? "").trim();
    return title ? `Created: ${title}` : "Created";
  }

  if (e.event_type === "deleted") return "Deleted";

  if (e.event_type === "moved") {
    const fromId = String(p?.from ?? "");
    const toId = String(p?.to ?? "");
    const from = opts.columns.find((c) => String(c.id) === fromId)?.name || fromId || "";
    const to = opts.columns.find((c) => String(c.id) === toId)?.name || toId || "";
    if (from && to) return `Moved from ${from} → ${to}`;
    return "Moved";
  }

  if (e.event_type === "updated") {
    const changes = p?.changes || {};
    const keys = Object.keys(changes);
    if (keys.length === 0) return "Updated";

    const key = keys[0];
    const ch = changes[key] || {};
    const from = ch?.from;
    const to = ch?.to;

    const prettyKey = String(key)
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());

    // Make column moves readable
    if (key === "column_id") {
      const fromName = opts.columns.find((c) => String(c.id) === String(from))?.name || String(from ?? "");
      const toName = opts.columns.find((c) => String(c.id) === String(to))?.name || String(to ?? "");
      return `Column changed: ${fromName} → ${toName}`;
    }

    if (typeof from === "undefined" && typeof to === "undefined") return `Updated: ${prettyKey}`;
    return `${prettyKey} changed: ${String(from ?? "")} → ${String(to ?? "")}`;
  }

  // Fallback (keep it readable)
  return String(e.event_type || "event");
}

  // Filter helpers
  function applyTaskFilters(tasksToFilter: Task[]): Task[] {
    return tasksToFilter.filter((t) => {
      // Status filter (if size matches all statuses or is 0, show all; otherwise filter)
      const allStatuses = statuses.length;
      if (taskFilterStatuses.size > 0 && taskFilterStatuses.size < allStatuses && !taskFilterStatuses.has(t.status)) {
        return false;
      }

      // Owner filter (if size matches all owners or is 0, show all; otherwise filter)
      const allOwners = attendees.length;
      if (taskFilterOwners.size > 0 && taskFilterOwners.size < allOwners) {
        const taskOwner = formatOwnerForForm(t.owner_id, t.owner_email);
        if (!taskFilterOwners.has(taskOwner)) {
          return false;
        }
      }

      // Priority filter (if size matches all priorities or is 0, show all; otherwise filter)
      const allPriorities = priorities.length;
      if (taskFilterPriorities.size > 0 && taskFilterPriorities.size < allPriorities && !taskFilterPriorities.has(t.priority)) {
        return false;
      }

      return true;
    });
  }

  function applyMilestoneFilters(milestonesToFilter: Milestone[]): Milestone[] {
    const milestoneStatuses = ["Pending", "In Progress", "Completed", "Delayed"];
    return milestonesToFilter.filter((m) => {
      // Status filter
      if (milestoneFilterStatuses.size > 0 && milestoneFilterStatuses.size < milestoneStatuses.length && !milestoneFilterStatuses.has(m.status)) {
        return false;
      }
      // Owner filter
      const allOwners = attendees.length;
      if (milestoneFilterOwners.size > 0 && milestoneFilterOwners.size < allOwners) {
        const milestoneOwner = formatOwnerForForm(m.owner_id, m.owner_email);
        if (!milestoneFilterOwners.has(milestoneOwner)) {
          return false;
        }
      }
      // Priority filter
      const allPriorities = priorities.length;
      if (milestoneFilterPriorities.size > 0 && milestoneFilterPriorities.size < allPriorities && !milestoneFilterPriorities.has(m.priority)) {
        return false;
      }
      return true;
    });
  }

  function applyNoteFilters(notesToFilter: OngoingNote[]): OngoingNote[] {
    const allCategories = availableNoteCategories.length;
    if (noteFilterCategories.size === 0 || noteFilterCategories.size === allCategories) {
      return notesToFilter;
    }
    return notesToFilter.filter((n) => n.category && noteFilterCategories.has(n.category));
  }

  function clearTaskFilters() {
    setTaskFilterStatuses(new Set(statuses.map((s) => s.name)));
    setTaskFilterOwners(new Set(attendees.map((a) => formatOwnerForForm(a.user_id, a.email))));
    setTaskFilterPriorities(new Set(priorities.map((p) => p.name)));
  }

  function clearMilestoneFilters() {
    const milestoneStatuses = ["Pending", "In Progress", "Completed", "Delayed"];
    setMilestoneFilterStatuses(new Set(milestoneStatuses));
    setMilestoneFilterOwners(new Set(attendees.map((a) => formatOwnerForForm(a.user_id, a.email))));
    setMilestoneFilterPriorities(new Set(priorities.map((p) => p.name)));
  }

  function clearNoteFilters() {
    setNoteFilterCategories(new Set(availableNoteCategories));
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
      .select("id,name,position,color_hex")
      .eq("meeting_id", meetingId)
      .order("position", { ascending: true });

    if (!s.error && (s.data?.length ?? 0) > 0) {
      setStatuses((s.data ?? []) as any);
      return;
    }

    const seed = [
      { meeting_id: meetingId, name: "In Progress", position: 1, color_hex: "#2563EB" },
      { meeting_id: meetingId, name: "Needs Review", position: 2, color_hex: "#EA580C" },
      { meeting_id: meetingId, name: "Waiting", position: 3, color_hex: "#CA8A04" },
      { meeting_id: meetingId, name: "Completed", position: 4, color_hex: "#16A34A" },
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
      .select("id,name,position,color_hex")
      .eq("meeting_id", meetingId)
      .order("position", { ascending: true });

    if (!again.error) setStatuses((again.data ?? []) as any);

  }

  async function ensureDefaultPriorities(meetingId: string) {
    const p = await sb
      .from("meeting_task_priorities")
      .select("id,name,position,color_hex")
      .eq("meeting_id", meetingId)
      .order("position", { ascending: true });

    if (!p.error && (p.data?.length ?? 0) > 0) {
      setPriorities(p.data as PriorityOpt[]);
      return;
    }

    const seed = [
      { meeting_id: meetingId, name: "Urgent", position: 1, color_hex: "#DC2626" },
      { meeting_id: meetingId, name: "High", position: 2, color_hex: "#EA580C" },
      { meeting_id: meetingId, name: "Normal", position: 3, color_hex: "#2563EB" },
      { meeting_id: meetingId, name: "Low", position: 4, color_hex: "#16A34A" },
    ];
    
    const ins = await sb.from("meeting_task_priorities").insert(seed);
    // ignore if table doesn't exist yet / RLS / duplicates
    if (ins.error) {
      // no-op
    }

    const again = await sb
      .from("meeting_task_priorities")
      .select("id,name,position,color_hex")
      .eq("meeting_id", meetingId)
      .order("position", { ascending: true });

    if (!again.error) setPriorities((again.data ?? []) as any);
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

    const at = await sb
      .from("meeting_attendees")
      .select("email,full_name,user_id,color_hex")
      .eq("meeting_id", meetingId)
      .order("created_at", { ascending: true });
    if (!at.error) setAttendees((at.data ?? []) as any);

    const c = await sb
      .from("meeting_task_columns")
      .select("id,name,position")
      .eq("meeting_id", meetingId)
      .order("position", { ascending: true });
    if (c.error) throw c.error;
    setColumns((c.data ?? []) as any);

    await ensureDefaultStatuses(meetingId);
    await ensureDefaultPriorities(meetingId);

    const t = await sb
      .from("meeting_tasks")
      .select("id,column_id,title,status,priority,owner_id,owner_email,owner_name,start_date,due_date,notes,position,updated_at")
      .eq("meeting_id", meetingId)
      .order("position", { ascending: true });
    if (t.error) throw t.error;
    const taskRows = (t.data ?? []) as any as Task[];
    setTasks(taskRows);
    await loadLatestEvents(taskRows.map((x) => x.id));

    // Load milestones
    const mil = await sb
      .from("meeting_milestones")
      .select("id,title,description,target_date,status,priority,owner_id,owner_email,owner_name,position,updated_at")
      .eq("meeting_id", meetingId)
      .order("position", { ascending: true });
    if (!mil.error) setMilestones((mil.data ?? []) as any);

    // Load ongoing notes
    const notes = await sb
      .from("meeting_ongoing_notes")
      .select("id,title,content,category,position,updated_at")
      .eq("meeting_id", meetingId)
      .order("position", { ascending: true });
    if (!notes.error) setOngoingNotes((notes.data ?? []) as any);

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

  // Initialize task filters when data is loaded
  useEffect(() => {
    if (statuses.length > 0 && taskFilterStatuses.size === 0) {
      setTaskFilterStatuses(new Set(statuses.map((s) => s.name)));
    }
  }, [statuses, taskFilterStatuses.size]);

  useEffect(() => {
    if (attendees.length > 0 && taskFilterOwners.size === 0) {
      setTaskFilterOwners(new Set(attendees.map((a) => formatOwnerForForm(a.user_id, a.email))));
    }
  }, [attendees, taskFilterOwners.size]);

  useEffect(() => {
    if (priorities.length > 0 && taskFilterPriorities.size === 0) {
      setTaskFilterPriorities(new Set(priorities.map((p) => p.name)));
    }
  }, [priorities, taskFilterPriorities.size]);

  // Initialize milestone filters when data is loaded
  useEffect(() => {
    const milestoneStatuses = ["Pending", "In Progress", "Completed", "Delayed"];
    if (milestoneFilterStatuses.size === 0) {
      setMilestoneFilterStatuses(new Set(milestoneStatuses));
    }
  }, [milestoneFilterStatuses.size]);

  useEffect(() => {
    if (attendees.length > 0 && milestoneFilterOwners.size === 0) {
      setMilestoneFilterOwners(new Set(attendees.map((a) => formatOwnerForForm(a.user_id, a.email))));
    }
  }, [attendees, milestoneFilterOwners.size]);

  useEffect(() => {
    if (priorities.length > 0 && milestoneFilterPriorities.size === 0) {
      setMilestoneFilterPriorities(new Set(priorities.map((p) => p.name)));
    }
  }, [priorities, milestoneFilterPriorities.size]);

  // Initialize note filters when categories are available
  useEffect(() => {
    if (availableNoteCategories.length > 0 && noteFilterCategories.size === 0) {
      setNoteFilterCategories(new Set(availableNoteCategories));
    }
  }, [availableNoteCategories, noteFilterCategories.size]);


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
  const priorityOpts = sortByPos(priorities);

  function openNewTask(colId: string) {
    setEditingTaskId(null);
    setTColumnId(colId);
    setTTitle("");
    setTStatus(statusOpts[0]?.name ?? "In Progress");
    setTPriority(priorityOpts[0]?.name ?? "Normal");
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
    setTOwner(formatOwnerForForm(task.owner_id, task.owner_email));
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
    if (!ev.error) {
      setTEvents((ev.data ?? []) as any);
      
      // Load profiles for event creators if not already loaded
      const eventUserIds = (ev.data ?? [])
        .map((e: any) => e.created_by)
        .filter((id: any) => id && !profiles.find((p) => p.id === id));
      
      if (eventUserIds.length > 0) {
        const pr = await sb
          .from("profiles")
          .select("id,full_name,email,color_hex")
          .in("id", eventUserIds);
        if (!pr.error && pr.data) {
          setProfiles((prev) => [...prev, ...(pr.data as any)]);
        }
      }
    }
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

      const ownerIsEmail = (tOwner || "").startsWith("email:");
      const ownerEmail = ownerIsEmail ? String(tOwner).slice("email:".length).trim().toLowerCase() : null;

      const attendeeOwner = ownerIsEmail
        ? attendees.find((a) => String(a.email || "").toLowerCase() === String(ownerEmail || "").toLowerCase())
        : attendees.find((a) => a.user_id && String(a.user_id) === String(tOwner || ""));

      const profileOwner = !ownerIsEmail && tOwner ? profiles.find((p) => String(p.id) === String(tOwner)) : null;

      const owner_id = !ownerIsEmail && tOwner ? String(tOwner) : null;
      const rawName =
            (attendeeOwner?.full_name?.trim() ||
              profileOwner?.full_name?.trim() ||
              null) ?? null;
          
          const resolvedEmail =
            (ownerEmail ||
              attendeeOwner?.email?.trim() ||
              profileOwner?.email?.trim() ||
              null) ?? null;
          
          const owner_name =
            resolvedEmail
              ? formatAttendeeLabel(rawName, resolvedEmail)
              : null;
          
          const owner_email = resolvedEmail;

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
            owner_id,
            owner_email,
            owner_name,
            start_date: tStart || null,
            due_date: tDue || null,
            notes: tNotes || null,
            position: maxPos + 1,
            created_by: userId,
          })
          .select("id,column_id,title,status,priority,owner_id,owner_email,owner_name,start_date,due_date,notes,position,updated_at")
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
          owner_id,
          owner_email,
          owner_name,
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
          .select("id,column_id,title,status,priority,owner_id,owner_email,owner_name,start_date,due_date,notes,position,updated_at")
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
      .select("id,column_id,title,status,priority,owner_id,owner_email,owner_name,start_date,due_date,notes,position,updated_at")
      .single();

    if (!upd.error) {
      setTasks((prev) => prev.map((x) => (x.id === activeId ? (upd.data as any) : x)));
      await writeTaskEvent(activeId, "moved", { from: task.column_id, to: overId });
      await refreshLatestForTask(activeId);
    }
  }

  // Milestone functions
  function openNewMilestone() {
    setEditingMilestoneId(null);
    setMTitle("");
    setMDescription("");
    setMTargetDate("");
    setMStatus("Pending");
    setMPriority("Normal");
    setMOwner("");
    setMilestoneOpen(true);
  }

  async function openEditMilestone(milestoneId: string) {
    const milestone = milestones.find((m) => m.id === milestoneId);
    if (!milestone) return;
    setEditingMilestoneId(milestoneId);
    setMTitle(milestone.title);
    setMDescription(milestone.description ?? "");
    setMTargetDate(toISODate(milestone.target_date));
    setMStatus(milestone.status);
    setMPriority(milestone.priority);
    setMOwner(formatOwnerForForm(milestone.owner_id, milestone.owner_email));
    setMilestoneOpen(true);
  }

  async function saveMilestone() {
    setBusy(true);
    try {
      const trimTitle = mTitle.trim();
      if (!trimTitle) throw new Error("Title is required");

      const { data: userData } = await sb.auth.getUser();
      const userId = userData?.user?.id ?? null;

      const ownerIsEmail = mOwner.startsWith("email:");
      let owner_id: string | null = null;
      let owner_email: string | null = null;
      let owner_name: string | null = null;

      if (mOwner && !ownerIsEmail) {
        owner_id = mOwner;
      } else if (ownerIsEmail) {
        owner_email = mOwner.replace("email:", "");
        const attendee = attendees.find((a) => String(a.email).toLowerCase() === owner_email);
        if (attendee) {
          owner_name = attendee.full_name;
          owner_id = attendee.user_id || null;
        }
      }

      if (!editingMilestoneId) {
        const maxPos = Math.max(0, ...milestones.map((m) => m.position ?? 0));
        const ins = await sb
          .from("meeting_milestones")
          .insert({
            meeting_id: meetingId,
            title: trimTitle,
            description: mDescription || null,
            target_date: mTargetDate || null,
            status: mStatus,
            priority: mPriority,
            owner_id,
            owner_email,
            owner_name,
            position: maxPos + 1,
            created_by: userId,
          })
          .select("id,title,description,target_date,status,priority,owner_id,owner_email,owner_name,position,updated_at")
          .single();
        if (ins.error) throw ins.error;
        setMilestones((prev) => [...prev, ins.data as any]);
      } else {
        const patch = {
          title: trimTitle,
          description: mDescription || null,
          target_date: mTargetDate || null,
          status: mStatus,
          priority: mPriority,
          owner_id,
          owner_email,
          owner_name,
          updated_at: new Date().toISOString(),
        };

        const upd = await sb
          .from("meeting_milestones")
          .update(patch)
          .eq("id", editingMilestoneId)
          .select("id,title,description,target_date,status,priority,owner_id,owner_email,owner_name,position,updated_at")
          .single();
        if (upd.error) throw upd.error;

        const after = upd.data as any as Milestone;
        setMilestones((prev) => prev.map((m) => (m.id === after.id ? after : m)));
      }

      setMilestoneOpen(false);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to save milestone");
    } finally {
      setBusy(false);
    }
  }

  async function deleteMilestone() {
    if (!editingMilestoneId) return;
    setBusy(true);
    try {
      const del = await sb.from("meeting_milestones").delete().eq("id", editingMilestoneId);
      if (del.error) throw del.error;

      setMilestones((prev) => prev.filter((m) => m.id !== editingMilestoneId));
      setMilestoneOpen(false);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to delete milestone");
    } finally {
      setBusy(false);
    }
  }

  // Ongoing Note functions
  function openNewNote() {
    setEditingNoteId(null);
    setNTitle("");
    setNContent("");
    setNCategory("");
    setNoteOpen(true);
  }

  async function openEditNote(noteId: string) {
    const note = ongoingNotes.find((n) => n.id === noteId);
    if (!note) return;
    setEditingNoteId(noteId);
    setNTitle(note.title);
    setNContent(note.content ?? "");
    setNCategory(note.category ?? "");
    setNoteOpen(true);
  }

  async function saveNote() {
    setBusy(true);
    try {
      const trimTitle = nTitle.trim();
      if (!trimTitle) throw new Error("Title is required");

      const { data: userData } = await sb.auth.getUser();
      const userId = userData?.user?.id ?? null;

      if (!editingNoteId) {
        const maxPos = Math.max(0, ...ongoingNotes.map((n) => n.position ?? 0));
        const ins = await sb
          .from("meeting_ongoing_notes")
          .insert({
            meeting_id: meetingId,
            title: trimTitle,
            content: nContent || null,
            category: nCategory || null,
            position: maxPos + 1,
            created_by: userId,
          })
          .select("id,title,content,category,position,updated_at")
          .single();
        if (ins.error) throw ins.error;
        setOngoingNotes((prev) => [...prev, ins.data as any]);
      } else {
        const patch = {
          title: trimTitle,
          content: nContent || null,
          category: nCategory || null,
          updated_at: new Date().toISOString(),
        };

        const upd = await sb
          .from("meeting_ongoing_notes")
          .update(patch)
          .eq("id", editingNoteId)
          .select("id,title,content,category,position,updated_at")
          .single();
        if (upd.error) throw upd.error;

        const after = upd.data as any as OngoingNote;
        setOngoingNotes((prev) => prev.map((n) => (n.id === after.id ? after : n)));
      }

      setNoteOpen(false);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to save note");
    } finally {
      setBusy(false);
    }
  }

  async function deleteNote() {
    if (!editingNoteId) return;
    setBusy(true);
    try {
      const del = await sb.from("meeting_ongoing_notes").delete().eq("id", editingNoteId);
      if (del.error) throw del.error;

      setOngoingNotes((prev) => prev.filter((n) => n.id !== editingNoteId));
      setNoteOpen(false);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to delete note");
    } finally {
      setBusy(false);
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

      // IMPORTANT: Vercel serverless requests have a practical payload limit.
      // Keep segments small so uploads don't silently fail on longer meetings.
      // Can be overridden in Vercel with NEXT_PUBLIC_RECORDING_SEGMENT_SECONDS.
      const segmentSeconds = Math.max(60, Number(process.env.NEXT_PUBLIC_RECORDING_SEGMENT_SECONDS || "240"));
      tickRef.current = window.setInterval(() => {
        setRecSeconds((s) => {
          const next = s + 1;

          // Safety cap (2 hours)
          if (next >= 7200) setTimeout(() => stopRecordingAndUpload(), 0);

          // Auto-segment to keep recordings small enough for transcription on long meetings.
          // This uploads the segment and immediately starts a new one.
          if (segmentSeconds && next > 0 && next % segmentSeconds === 0) {
            setTimeout(() => void rotateRecordingSegment(), 0);
          }

          return next;
        });
      }, 1000);

      setRecMin(true);
    } catch (e: any) {
      setRecErr(e?.message ?? "Could not start recording");
    }
  }

  async function rotateRecordingSegment() {
    if (!mediaRecorderRef.current) return;
    // Stop current recorder, upload, then immediately start a new recording segment.
    const up = await stopRecordingAndUpload();
    if (up) {
      // Restart recording automatically (best-effort)
      await startRecording();
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
  setInfo(null);
  try {
    if (isRecording) {
      await stopRecordingAndUpload();
    }

    const res = await fetch("/api/meetings/ai/conclude", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        meetingId,
        sessionId: currentSession.id,
        referenceLink: minutesReferenceLink || null,
      }),
    });

    const j = await res.json().catch(() => ({} as any));
    if (!res.ok) throw new Error(j?.error || "Failed to conclude meeting");

    const s = await sb
      .from("meeting_minutes_sessions")
      .select("id,started_at,ended_at,pdf_path,ai_status,ai_error")
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


    if (j.hasRecording) {
      setInfo("Meeting concluded successfully! Click the 'Process Recording' button to generate AI minutes.");
    } else {
      setInfo("Meeting concluded successfully! No recording to process.");
    }
  } catch (e: any) {
    setErr(e?.message ?? "Failed to conclude meeting");
  } finally {
    setBusy(false);
  }
}

  async function processRecording() {
    if (!prevSession?.id) return;
    setBusy(true);
    setErr(null);
    setInfo(null);
    try {
      const res = await fetch("/api/meetings/ai/process-recording", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          meetingId,
          sessionId: prevSession.id,
        }),
      });

      const j = await res.json().catch(() => ({} as any));
      if (!res.ok) throw new Error(j?.error || "Failed to start AI processing");

      setInfo("AI processing started...");

      const pollSessionId = prevSession.id;
      const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

      // NOTE: Using client-side polling as an interim solution.
      // For production with many concurrent long recordings, consider:
      // - Supabase Realtime subscriptions
      // - Server-sent events (SSE)
      // - Webhooks to update status externally
      const maxSeconds = Number(process.env.NEXT_PUBLIC_AI_POLL_MAX_SECONDS || "1800");
      const intervalMs = Math.max(2000, Number(process.env.NEXT_PUBLIC_AI_POLL_INTERVAL_MS || "4000"));
      const maxIters = Math.max(1, Math.floor((maxSeconds * 1000) / intervalMs));

      let reachedTerminal = false;
      for (let i = 0; i < maxIters; i++) {
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
            reachedTerminal = true;
            await loadAgendaNotes(pollSessionId, true);
            const s2 = await sb
              .from("meeting_minutes_sessions")
              .select("id,started_at,ended_at,pdf_path,ai_status,ai_error")
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
            setInfo("AI processing complete!");
            if (pdfPath) break;
          }

          if (status === "error") {
            reachedTerminal = true;
            setErr(aiError || "AI processing failed");
            break;
          }
        }

        await sleep(intervalMs);
      }

      if (!reachedTerminal) {
        setInfo(
          "AI processing is still running in the background. " +
            "You can keep working and come back later—open 'View Previous Meetings' to check status and download the PDF once it's ready."
        );
      }
    } catch (e: any) {
      setErr(e?.message ?? "Failed to process recording");
    } finally {
      setBusy(false);
    }
  }

  async function loadPreviousSessions() {
    const s = await sb
      .from("meeting_minutes_sessions")
      .select("id,started_at,ended_at,pdf_path,ai_status,ai_error,email_status,email_sent_at")
      .eq("meeting_id", meetingId)
      .order("started_at", { ascending: false })
      .limit(50);
    if (!s.error) setPrevSessions((s.data ?? []) as any);
  }

  async function sendMeetingNotes(sessionId: string) {
    try {
      const { data: userData } = await sb.auth.getUser();
      const sentById = userData?.user?.id ?? null;

      const res = await fetch("/api/meetings/ai/send-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meetingId, sessionId, sentById }),
      });
      const j = await res.json().catch(() => ({} as any));
      if (!res.ok) throw new Error(j?.error || "Failed to send");

      setInfo("Meeting notes sent.");
      await loadPreviousSessions();
    } catch (e: any) {
      alert(e?.message ?? "Failed to send meeting notes");
    }
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
      .select("id,started_at,ended_at,pdf_path,ai_status,ai_error")
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
    const ins = await sb.from("meeting_task_statuses").insert({ meeting_id: meetingId, name: trimmed, position: maxPos + 1 }).select("id,name,position,color_hex").single();
    if (!ins.error) setStatuses((prev) => [...prev, ins.data as any]);
  }

  async function updateStatus(id: string, name: string) {
    setStatuses((prev) => prev.map((s) => (s.id === id ? { ...s, name } : s)));
    await sb.from("meeting_task_statuses").update({ name }).eq("id", id);
  }

  async function updateStatusColor(id: string, color_hex: string) {
    setStatuses((prev) => prev.map((s) => (s.id === id ? { ...s, color_hex } : s)));
    await sb.from("meeting_task_statuses").update({ color_hex }).eq("id", id);
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

  // Priority CRUD functions
  async function addPriority(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    const maxPos = Math.max(0, ...priorityOpts.map((p) => p.position ?? 0));
    const ins = await sb.from("meeting_task_priorities").insert({ meeting_id: meetingId, name: trimmed, position: maxPos + 1 }).select("id,name,position,color_hex").single();
    if (!ins.error) setPriorities((prev) => [...prev, ins.data as any]);
  }

  async function updatePriority(id: string, name: string) {
    setPriorities((prev) => prev.map((p) => (p.id === id ? { ...p, name } : p)));
    await sb.from("meeting_task_priorities").update({ name }).eq("id", id);
  }

  async function updatePriorityColor(id: string, color_hex: string) {
    setPriorities((prev) => prev.map((p) => (p.id === id ? { ...p, color_hex } : p)));
    await sb.from("meeting_task_priorities").update({ color_hex }).eq("id", id);
  }

  async function deletePriority(id: string) {
    const priorityName = priorities.find((p) => p.id === id)?.name;
    if (!priorityName) return;
    const used = tasks.some((t) => t.priority === priorityName) || milestones.some((m) => m.priority === priorityName);
    if (used) {
      alert("That priority is currently used by at least one task or milestone. Change those first.");
      return;
    }
    await sb.from("meeting_task_priorities").delete().eq("id", id);
    setPriorities((prev) => prev.filter((p) => p.id !== id));
  }

  // Note category management functions
  function addNoteCategory(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (noteCategories.includes(trimmed)) {
      alert("A category with this name already exists.");
      return;
    }
    setNoteCategories((prev) => [...prev, trimmed].sort());
  }

  function updateNoteCategory(oldName: string, newName: string) {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setNoteCategories((prev) => prev.map((c) => (c === oldName ? trimmed : c)).sort());
    // Also update existing notes with this category
    setOngoingNotes((prev) => prev.map((n) => (n.category === oldName ? { ...n, category: trimmed } : n)));
    // Update in database
    const notesToUpdate = ongoingNotes.filter((n) => n.category === oldName);
    if (notesToUpdate.length > 0) {
      Promise.all(
        notesToUpdate.map((n) => sb.from("meeting_ongoing_notes").update({ category: trimmed }).eq("id", n.id))
      ).catch((err) => {
        console.error("Failed to update note categories in database:", err);
      });
    }
  }

  function deleteNoteCategory(name: string) {
    const used = ongoingNotes.some((n) => n.category === name);
    if (used) {
      alert("This category is currently used by at least one note. Change those notes first.");
      return;
    }
    setNoteCategories((prev) => prev.filter((c) => c !== name));
  }

  // Attendee CRUD functions
  async function addAttendee(email: string, fullName: string, color: string) {
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedName = fullName.trim();
    if (!trimmedEmail) return;
    const exists = attendees.find((a) => a.email?.toLowerCase() === trimmedEmail);
    if (exists) {
      alert("An attendee with this email already exists.");
      return;
    }
    const ins = await sb.from("meeting_attendees").insert({ 
      meeting_id: meetingId, 
      email: trimmedEmail, 
      full_name: trimmedName || null,
      color_hex: color || null
    }).select("email,full_name,user_id,color_hex").single();
    if (!ins.error) setAttendees((prev) => [...prev, ins.data]);
  }

  async function updateAttendee(email: string, fullName: string, color: string) {
    setAttendees((prev) => prev.map((a) => 
      a.email?.toLowerCase() === email.toLowerCase() 
        ? { ...a, full_name: fullName, color_hex: color }
        : a
    ));
    await sb.from("meeting_attendees")
      .update({ full_name: fullName, color_hex: color })
      .eq("meeting_id", meetingId)
      .eq("email", email);
  }

  async function deleteAttendee(email: string) {
    const used = tasks.some((t) => t.owner_email?.toLowerCase() === email.toLowerCase()) ||
                 milestones.some((m) => m.owner_email?.toLowerCase() === email.toLowerCase());
    if (used) {
      alert("This attendee is assigned to tasks or milestones. Unassign them first.");
      return;
    }
    await sb.from("meeting_attendees")
      .delete()
      .eq("meeting_id", meetingId)
      .eq("email", email);
    setAttendees((prev) => prev.filter((a) => a.email?.toLowerCase() !== email.toLowerCase()));
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
              {/* Edit dropdown */}
              <Dropdown
                trigger={<Button variant="ghost">Edit ▾</Button>}
                items={[
                  { label: "Edit agenda", onClick: () => setAgendaOpen(true) },
                  { label: "Task statuses", onClick: () => setStatusMgrOpen(true) },
                  { label: "Task priorities", onClick: () => setPriorityMgrOpen(true) },
                  { label: "Edit note categories", onClick: () => setNoteCategoriesOpen(true) },
                  { label: "Edit attendees", onClick: () => setAttendeesMgrOpen(true) },
                  { label: "Email settings", onClick: () => setEmailSettingsOpen(true) },
                ]}
              />
              
              {/* Meeting dropdown */}
              <Dropdown
                trigger={<Button>Meeting ▾</Button>}
                items={[
                  { label: "New meeting minutes", onClick: onNewMinutes, disabled: busy },
                  { label: "Conclude meeting", onClick: concludeMeeting, disabled: busy },
                  ...(prevSession && prevSession.ai_status === "ready" 
                    ? [{ label: "Process Recording", onClick: processRecording, disabled: busy }]
                    : []
                  ),
                ]}
              />
              
              {/* View dropdown */}
              <Dropdown
                trigger={<Button variant="ghost">View ▾</Button>}
                items={[
                  { 
                    label: "Send meeting notes", 
                    onClick: async () => {
                      await loadPreviousSessions();
                      setSendNotesOpen(true);
                    }
                  },
                  { 
                    label: "View Previous Meetings", 
                    onClick: async () => {
                      await loadPreviousSessions();
                      setPrevMeetingsOpen(true);
                    }
                  },
                ]}
              />
            </div>
          </div>

          {err && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">{err}</div>}
          {info && <div className="text-sm text-blue-800 bg-blue-50 border border-blue-200 rounded-lg p-2">{info}</div>}

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
                right={
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      className="text-gray-500 hover:text-gray-700 transition-colors"
                      onClick={() => setTasksCollapsed((v) => !v)}
                      title={tasksCollapsed ? "Expand" : "Collapse"}
                    >
                      {tasksCollapsed ? (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                        </svg>
                      )}
                    </button>
                  </div>
                }
              >
                {!tasksCollapsed && (
                <>
                  {/* Filter bar */}
                  <div className="mb-4 p-3 bg-gray-50 rounded-lg border">
                    <div className="grid gap-3 md:grid-cols-4">
                      <div>
                        <label className="text-xs text-gray-600 mb-1 block">Status</label>
                        <MultiSelectDropdown
                          label="Status"
                          options={statuses.map((s) => ({ value: s.name, label: s.name }))}
                          selected={taskFilterStatuses}
                          onChange={setTaskFilterStatuses}
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-600 mb-1 block">Owner</label>
                        <MultiSelectDropdown
                          label="Owner"
                          options={attendees.map((a) => ({
                            value: formatOwnerForForm(a.user_id, a.email),
                            label: a.full_name || a.email,
                          }))}
                          selected={taskFilterOwners}
                          onChange={setTaskFilterOwners}
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-600 mb-1 block">Priority</label>
                        <MultiSelectDropdown
                          label="Priority"
                          options={priorities.map((p) => ({ value: p.name, label: p.name }))}
                          selected={taskFilterPriorities}
                          onChange={setTaskFilterPriorities}
                        />
                      </div>
                      <div className="flex items-end">
                        <Button
                          variant="ghost"
                          onClick={clearTaskFilters}
                        >
                          Clear Filters
                        </Button>
                      </div>
                    </div>
                  </div>

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
                            {sortTasksByDueDate(
                              applyTaskFilters(tasks.filter((t) => t.column_id === c.id))
                            ).map((t) => {
                              const le = latestEventByTask[t.id];
                              return (
                                <DraggableTaskCard key={t.id} id={t.id}>
                                  <div
                                    className="rounded-xl border bg-white p-3 cursor-pointer select-none"
                                    style={{ borderLeft: `6px solid ${getOwnerColor(t)}` }}
                                    onClick={() => openEditTask(t.id)}
                                  >
                                    <div className="text-sm font-semibold">{t.title}</div>
                                    <div className="mt-1 flex flex-wrap gap-2">
                                      <span 
                                        className="rounded-full px-2 py-0.5 text-xs font-medium text-white"
                                        style={{ backgroundColor: statusColor(t.status) }}
                                      >
                                        {t.status}
                                      </span>
                                      <span 
                                        className="rounded-full px-2 py-0.5 text-xs font-medium text-white"
                                        style={{ backgroundColor: priorityColor(t.priority) }}
                                      >
                                        {t.priority}
                                      </span>
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
                </>
                )}
              </Card>

              {/* Milestones Section */}
              <Card
                title="Milestones"
                right={
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      className="text-gray-500 hover:text-gray-700 transition-colors"
                      onClick={() => setMilestonesCollapsed((v) => !v)}
                      title={milestonesCollapsed ? "Expand" : "Collapse"}
                    >
                      {milestonesCollapsed ? (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                        </svg>
                      )}
                    </button>
                    <Button variant="ghost" onClick={openNewMilestone}>
                      + New Milestone
                    </Button>
                  </div>
                }
              >
                {!milestonesCollapsed && (
                  <>
                    {/* Filter bar */}
                    <div className="mb-4 p-3 bg-gray-50 rounded-lg border">
                      <div className="grid gap-3 md:grid-cols-4">
                        <div>
                          <label className="text-xs text-gray-600 mb-1 block">Status</label>
                          <MultiSelectDropdown
                            label="Status"
                            options={[
                              { value: "Pending", label: "Pending" },
                              { value: "In Progress", label: "In Progress" },
                              { value: "Completed", label: "Completed" },
                              { value: "Delayed", label: "Delayed" },
                            ]}
                            selected={milestoneFilterStatuses}
                            onChange={setMilestoneFilterStatuses}
                          />
                        </div>
                        <div>
                          <label className="text-xs text-gray-600 mb-1 block">Owner</label>
                          <MultiSelectDropdown
                            label="Owner"
                            options={attendees.map((a) => ({
                              value: formatOwnerForForm(a.user_id, a.email),
                              label: a.full_name || a.email,
                            }))}
                            selected={milestoneFilterOwners}
                            onChange={setMilestoneFilterOwners}
                          />
                        </div>
                        <div>
                          <label className="text-xs text-gray-600 mb-1 block">Priority</label>
                          <MultiSelectDropdown
                            label="Priority"
                            options={priorities.map((p) => ({ value: p.name, label: p.name }))}
                            selected={milestoneFilterPriorities}
                            onChange={setMilestoneFilterPriorities}
                          />
                        </div>
                        <div className="flex items-end">
                          <Button
                            variant="ghost"
                            onClick={clearMilestoneFilters}
                          >
                            Clear
                          </Button>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3">
                    {filteredMilestones.length === 0 ? (
                      <div className="text-sm text-gray-600">No milestones match filters.</div>
                    ) : (
                      sortMilestonesByTargetDate(filteredMilestones).map((m) => (
                        <div
                          key={m.id}
                          className="rounded-xl border bg-white p-3 cursor-pointer"
                          style={{ borderLeft: `6px solid ${getOwnerColor(m)}` }}
                          onClick={() => openEditMilestone(m.id)}
                        >
                          <div className="text-sm font-semibold">{m.title}</div>
                          {m.description && <div className="text-xs text-gray-600 mt-1">{m.description}</div>}
                          <div className="mt-2 flex flex-wrap gap-2">
                            <span 
                              className="rounded-full px-2 py-0.5 text-xs font-medium text-white"
                              style={{ backgroundColor: priorityColor(m.priority) }}
                            >
                              {m.priority}
                            </span>
                            <Pill>{m.status}</Pill>
                            {m.target_date && <Pill>Target: {m.target_date}</Pill>}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                  </>
                )}
              </Card>

              {/* Ongoing Notes Section */}
              <Card
                title="Ongoing Notes"
                right={
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      className="text-gray-500 hover:text-gray-700 transition-colors"
                      onClick={() => setNotesCollapsed((v) => !v)}
                      title={notesCollapsed ? "Expand" : "Collapse"}
                    >
                      {notesCollapsed ? (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                        </svg>
                      )}
                    </button>
                    <Button variant="ghost" onClick={openNewNote}>
                      + New Note
                    </Button>
                  </div>
                }
              >
                {!notesCollapsed && (
                  <>
                    {/* Filter bar */}
                    {availableNoteCategories.length > 0 && (
                      <div className="mb-3 p-3 bg-gray-50 rounded-lg border">
                        <div className="grid gap-3 md:grid-cols-2">
                          <div>
                            <label className="text-xs text-gray-600 mb-1 block">Category</label>
                            <MultiSelectDropdown
                              label="Category"
                              options={availableNoteCategories.map((cat) => ({ value: cat, label: cat }))}
                              selected={noteFilterCategories}
                              onChange={setNoteFilterCategories}
                            />
                          </div>
                          <div className="flex items-end">
                            <Button
                              variant="ghost"
                              onClick={clearNoteFilters}
                            >
                              Clear
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="space-y-3">
                    {filteredNotes.length === 0 ? (
                      <div className="text-sm text-gray-600">No notes match filter.</div>
                    ) : (
                      sortByPos(filteredNotes).map((n) => (
                        <div
                          key={n.id}
                          className="rounded-xl border bg-white p-3 cursor-pointer"
                          onClick={() => openEditNote(n.id)}
                        >
                          <div className="flex items-center justify-between">
                            <div className="text-sm font-semibold">{n.title}</div>
                            {n.category && <Pill>{n.category}</Pill>}
                          </div>
                          {n.content && (
                            <div className="text-xs text-gray-600 mt-2 whitespace-pre-wrap line-clamp-3">
                              {n.content}
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                  </>
                )}
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
                    style={{ 
                      backgroundColor: statusColor(tStatus), 
                      color: 'white',
                      fontWeight: '500'
                    }}
                    value={tStatus}
                    onChange={(e) => setTStatus(e.target.value)}
                  >
                    {statusOpts.length ? (
                      statusOpts.map((s) => (
                        <option 
                          key={s.id} 
                          value={s.name}
                          style={{ 
                            backgroundColor: s.color_hex || statusColor(s.name),
                            color: 'white'
                          }}
                        >
                          {s.name}
                        </option>
                      ))
                    ) : (
                      <>
                        <option style={{ backgroundColor: '#2563EB', color: 'white' }}>In Progress</option>
                        <option style={{ backgroundColor: '#EA580C', color: 'white' }}>Needs Review</option>
                        <option style={{ backgroundColor: '#CA8A04', color: 'white' }}>Waiting</option>
                        <option style={{ backgroundColor: '#16A34A', color: 'white' }}>Completed</option>
                      </>
                    )}
                  </select>
                </div>

                <div>
                  <label className="text-xs text-gray-600">Priority</label>
                  <select
                    className="w-full rounded-lg border px-3 py-2 text-sm"
                    style={{ 
                      backgroundColor: priorityColor(tPriority), 
                      color: 'white',
                      fontWeight: '500'
                    }}
                    value={tPriority}
                    onChange={(e) => setTPriority(e.target.value)}
                  >
                    {priorityOpts.length ? (
                      priorityOpts.map((p) => (
                        <option 
                          key={p.id} 
                          value={p.name}
                          style={{ 
                            backgroundColor: p.color_hex || priorityColor(p.name),
                            color: 'white'
                          }}
                        >
                          {p.name}
                        </option>
                      ))
                    ) : (
                      <>
                        <option style={{ backgroundColor: '#DC2626', color: 'white' }}>Urgent</option>
                        <option style={{ backgroundColor: '#EA580C', color: 'white' }}>High</option>
                        <option style={{ backgroundColor: '#2563EB', color: 'white' }}>Normal</option>
                        <option style={{ backgroundColor: '#16A34A', color: 'white' }}>Low</option>
                      </>
                    )}
                  </select>
                </div>

                <div>
                  <label className="text-xs text-gray-600">Owner</label>
                  <select className="w-full rounded-lg border px-3 py-2 text-sm" value={tOwner} onChange={(e) => setTOwner(e.target.value)}>
                    <option value="">Unassigned</option>
                    {(attendees ?? []).map((a: any) => {
                      const email = String(a.email || "").trim();
                      const fullName = a.full_name ? String(a.full_name) : null;
            
                      return (
                        <option key={email} value={`email:${email.toLowerCase()}`}>
                          {formatAttendeeLabel(fullName, email)}
                        </option>
                      );
                    })}
                  </select>
                  {tOwner && (
                    <div className="mt-1 flex items-center gap-2">
                      <div 
                        className="w-4 h-4 rounded border"
                        style={{ backgroundColor: tOwner.startsWith("email:") ? attendeeColor(tOwner.slice(6)) : ownerColor(tOwner) }}
                      />
                      <span className="text-xs text-gray-500">Owner color</span>
                    </div>
                  )}
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
                            <div className="mt-2 text-sm text-gray-800">
                              {e.event_type === "updated" && e.payload?.changes ? (
                                <ul className="list-disc pl-5 space-y-1">
                                  {Object.entries(e.payload.changes as any).map(([k, v]: any) => (
                                    <li key={k}>
                                      {formatTaskEventLine({
                                        event: { ...e, event_type: "updated", payload: { changes: { [k]: v } } } as any,
                                        columns,
                                      })}
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <div>{formatTaskEventLine({ event: e, columns })}</div>
                              )}
                            </div>
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

          {/* Send meeting notes modal */}
          <Modal
            open={sendNotesOpen}
            title="Send meeting notes"
            onClose={() => setSendNotesOpen(false)}
            footer={
              <Button variant="ghost" onClick={() => setSendNotesOpen(false)}>
                Close
              </Button>
            }
          >
            <div className="text-sm text-gray-600 mb-3">
              Choose which meeting minutes session to email. (PDF must be generated first.)
            </div>

            <div className="space-y-2">
              {prevSessions.length === 0 && !currentSession ? (
                <div className="text-sm text-gray-600">No sessions found.</div>
              ) : (
                [
                  ...(currentSession ? [currentSession] : []),
                  ...prevSessions,
                ].map((s) => (
                  <div key={s.id} className="rounded-xl border p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold">{prettyDate(s.started_at)}</div>
                        <div className="text-xs text-gray-600">
                          {s.ended_at ? `Ended ${prettyDate(s.ended_at)}` : "(In progress / not concluded)"}
                        </div>
                        {s.ai_status && s.ai_status !== "done" && (
                          <div className="text-xs text-gray-600 mt-1">
                            Status: {String(s.ai_status)}
                            {s.ai_status === "error" && s.ai_error ? ` — ${String(s.ai_error)}` : ""}
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col items-end gap-2">
                        <Button
                          variant="ghost"
                          onClick={() => sendMeetingNotes(s.id)}
                          disabled={!s.pdf_path}
                        >
                          Send
                        </Button>
                        <button
                          type="button"
                          className="text-xs underline underline-offset-2 hover:opacity-80"
                          onClick={() => void openSessionPdf(s.id)}
                          disabled={!s.pdf_path}
                        >
                          {s.pdf_path ? "View PDF" : s.ai_status === "error" ? "No PDF" : "Processing"}
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
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
                    {s.ai_status && s.ai_status !== "done" && (
                      <div className="text-xs text-gray-600 mt-1">
                        Status: {String(s.ai_status)}
                        {s.ai_status === "error" && s.ai_error ? ` — ${String(s.ai_error)}` : ""}
                      </div>
                    )}
                    <div className="text-xs text-gray-500 mt-1 flex items-center justify-between">
                      <span />
                      <button
                        type="button"
                        className="text-xs underline underline-offset-2 hover:opacity-80"
                        onClick={(e) => {
                          e.stopPropagation();
                          void openSessionPdf(s.id);
                        }}
                        disabled={!s.pdf_path}
                      >
                        {s.pdf_path ? "Link" : s.ai_status === "error" ? "No PDF" : "Processing"}
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
                  <input
                    type="color"
                    value={s.color_hex || "#6B7280"}
                    onChange={(e) => updateStatusColor(s.id, e.target.value)}
                    className="w-12 h-8 rounded border cursor-pointer"
                    title="Status color"
                  />
                  <Button variant="ghost" onClick={() => deleteStatus(s.id)}>
                    Delete
                  </Button>
                </div>
              ))}

              <AddStatusRow onAdd={addStatus} />
            </div>
          </Modal>

          {/* Priority manager modal */}
          <Modal
            open={priorityMgrOpen}
            title="Task Priorities"
            onClose={() => setPriorityMgrOpen(false)}
            footer={
              <Button variant="ghost" onClick={() => setPriorityMgrOpen(false)}>
                Close
              </Button>
            }
          >
            <div className="text-sm text-gray-600 mb-3">
              This controls the list of Priority values available for tasks and milestones in this meeting.
            </div>

            <div className="space-y-3">
              {priorityOpts.map((p) => (
                <div key={p.id} className="flex items-center gap-2">
                  <Input value={p.name} onChange={(e) => updatePriority(p.id, e.target.value)} />
                  <input
                    type="color"
                    value={p.color_hex || "#6B7280"}
                    onChange={(e) => updatePriorityColor(p.id, e.target.value)}
                    className="w-12 h-8 rounded border cursor-pointer"
                    title="Priority color"
                  />
                  <Button variant="ghost" onClick={() => deletePriority(p.id)}>
                    Delete
                  </Button>
                </div>
              ))}

              <AddPriorityRow onAdd={addPriority} />
            </div>
          </Modal>

          {/* Attendees manager modal */}
          <Modal
            open={attendeesMgrOpen}
            title="Edit Attendees"
            onClose={() => setAttendeesMgrOpen(false)}
            footer={
              <Button variant="ghost" onClick={() => setAttendeesMgrOpen(false)}>
                Close
              </Button>
            }
          >
            <div className="text-sm text-gray-600 mb-3">
              Manage the list of attendees for this meeting. These attendees are used in task/milestone owners and meeting notes recipients.
            </div>

            <div className="space-y-3">
              {attendees.map((a) => (
                <div key={a.email} className="flex items-center gap-2">
                  <div className="flex-1 grid grid-cols-2 gap-2">
                    <Input 
                      value={a.full_name || ""} 
                      onChange={(e) => updateAttendee(a.email, e.target.value, a.color_hex || "#6B7280")} 
                      placeholder="Full name"
                    />
                    <Input 
                      value={a.email} 
                      disabled
                      className="bg-gray-50"
                    />
                  </div>
                  <input
                    type="color"
                    value={a.color_hex || "#6B7280"}
                    onChange={(e) => updateAttendee(a.email, a.full_name || "", e.target.value)}
                    className="w-12 h-8 rounded border cursor-pointer"
                    title="Attendee color"
                  />
                  <Button variant="ghost" onClick={() => deleteAttendee(a.email)}>
                    Delete
                  </Button>
                </div>
              ))}

              <AddAttendeeRow onAdd={addAttendee} />
            </div>
          </Modal>

          {/* Note Categories Manager modal */}
          <Modal
            open={noteCategoriesOpen}
            title="Note Categories"
            onClose={() => setNoteCategoriesOpen(false)}
            footer={
              <Button variant="ghost" onClick={() => setNoteCategoriesOpen(false)}>
                Close
              </Button>
            }
          >
            <div className="text-sm text-gray-600 mb-3">
              Manage predefined categories for notes. Categories from existing notes are automatically included.
            </div>

            <div className="space-y-3">
              {availableNoteCategories.map((cat) => (
                <div key={cat} className="flex items-center gap-2">
                  <Input 
                    value={cat} 
                    onChange={(e) => updateNoteCategory(cat, e.target.value)}
                    className="flex-1"
                  />
                  <Button variant="ghost" onClick={() => deleteNoteCategory(cat)}>
                    Delete
                  </Button>
                </div>
              ))}

              <AddNoteCategoryRow onAdd={addNoteCategory} />
            </div>
          </Modal>

          {/* Milestone Modal */}
          <Modal
            open={milestoneOpen}
            title={editingMilestoneId ? "Edit Milestone" : "New Milestone"}
            onClose={() => setMilestoneOpen(false)}
            footer={
              <>
                {editingMilestoneId && (
                  <Button variant="ghost" onClick={deleteMilestone} disabled={busy}>
                    Delete
                  </Button>
                )}
                <Button variant="ghost" onClick={() => setMilestoneOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={saveMilestone} disabled={busy}>
                  Save
                </Button>
              </>
            }
          >
            <div className="space-y-4">
              <div>
                <label className="text-xs text-gray-600">Title *</label>
                <Input value={mTitle} onChange={(e) => setMTitle(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-gray-600">Description</label>
                <Textarea rows={3} value={mDescription} onChange={(e) => setMDescription(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-600">Status</label>
                  <select
                    className="w-full rounded-lg border px-3 py-2 text-sm"
                    value={mStatus}
                    onChange={(e) => setMStatus(e.target.value)}
                  >
                    <option value="Pending">Pending</option>
                    <option value="In Progress">In Progress</option>
                    <option value="Completed">Completed</option>
                    <option value="Delayed">Delayed</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-600">Priority</label>
                  <select
                    className="w-full rounded-lg border px-3 py-2 text-sm"
                    style={{ 
                      backgroundColor: priorityColor(mPriority), 
                      color: 'white',
                      fontWeight: '500'
                    }}
                    value={mPriority}
                    onChange={(e) => setMPriority(e.target.value)}
                  >
                    {priorityOpts.length ? (
                      priorityOpts.map((p) => (
                        <option 
                          key={p.id} 
                          value={p.name}
                          style={{ 
                            backgroundColor: p.color_hex || priorityColor(p.name),
                            color: 'white'
                          }}
                        >
                          {p.name}
                        </option>
                      ))
                    ) : (
                      <>
                        <option value="Urgent" style={{ backgroundColor: '#DC2626', color: 'white' }}>Urgent</option>
                        <option value="High" style={{ backgroundColor: '#EA580C', color: 'white' }}>High</option>
                        <option value="Normal" style={{ backgroundColor: '#2563EB', color: 'white' }}>Normal</option>
                        <option value="Low" style={{ backgroundColor: '#16A34A', color: 'white' }}>Low</option>
                      </>
                    )}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-600">Owner</label>
                  <select
                    className="w-full rounded-lg border px-3 py-2 text-sm"
                    value={mOwner}
                    onChange={(e) => setMOwner(e.target.value)}
                  >
                    <option value="">(None)</option>
                    <optgroup label="Registered Users">
                      {profiles.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.full_name || p.email || p.id}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Attendees (email)">
                      {attendees
                        .filter((a) => !a.user_id)
                        .map((a) => (
                          <option key={a.email} value={`email:${a.email.toLowerCase()}`}>
                            {a.full_name || a.email}
                          </option>
                        ))}
                    </optgroup>
                  </select>
                  {mOwner && (
                    <div className="mt-1 flex items-center gap-2">
                      <div 
                        className="w-4 h-4 rounded border"
                        style={{ backgroundColor: mOwner.startsWith("email:") ? attendeeColor(mOwner.slice(6)) : ownerColor(mOwner) }}
                      />
                      <span className="text-xs text-gray-500">Owner color</span>
                    </div>
                  )}
                </div>
                <div>
                  <label className="text-xs text-gray-600">Target Date</label>
                  <Input type="date" value={mTargetDate} onChange={(e) => setMTargetDate(e.target.value)} />
                </div>
              </div>
            </div>
          </Modal>

          {/* Ongoing Note Modal */}
          <Modal
            open={noteOpen}
            title={editingNoteId ? "Edit Note" : "New Note"}
            onClose={() => setNoteOpen(false)}
            footer={
              <>
                {editingNoteId && (
                  <Button variant="ghost" onClick={deleteNote} disabled={busy}>
                    Delete
                  </Button>
                )}
                <Button variant="ghost" onClick={() => setNoteOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={saveNote} disabled={busy}>
                  Save
                </Button>
              </>
            }
          >
            <div className="space-y-4">
              <div>
                <label className="text-xs text-gray-600">Title *</label>
                <Input value={nTitle} onChange={(e) => setNTitle(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-gray-600">Category (optional)</label>
                <select
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                  value={nCategory}
                  onChange={(e) => setNCategory(e.target.value)}
                >
                  <option value="">None</option>
                  {availableNoteCategories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-600">Content</label>
                <Textarea rows={8} value={nContent} onChange={(e) => setNContent(e.target.value)} />
              </div>
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
                      <Button onClick={() => void startRecording()} disabled={!currentSession || !!currentSession.ended_at || recBusy}>
                        Start recording
                      </Button>
                    ) : (
                      <Button onClick={() => void stopRecordingAndUpload()} disabled={recBusy}>
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

function AddPriorityRow({ onAdd }: { onAdd: (name: string) => void }) {
  const [name, setName] = useState("");
  return (
    <div className="flex items-center gap-2">
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Add a new priority..." />
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

function AddAttendeeRow({ onAdd }: { onAdd: (email: string, fullName: string, color: string) => void }) {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [color, setColor] = useState("#6B7280");
  return (
    <div className="space-y-2 border-t pt-3">
      <div className="text-sm font-medium">Add New Attendee</div>
      <div className="flex items-center gap-2">
        <div className="flex-1 grid grid-cols-2 gap-2">
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Full name" />
          <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email *" />
        </div>
        <input
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          className="w-12 h-8 rounded border cursor-pointer"
          title="Attendee color"
        />
        <Button
          variant="ghost"
          onClick={() => {
            const e = email.trim();
            if (!e) return;
            onAdd(e, fullName.trim(), color);
            setEmail("");
            setFullName("");
            setColor("#6B7280");
          }}
        >
          Add
        </Button>
      </div>
    </div>
  );
}

function AddNoteCategoryRow({ onAdd }: { onAdd: (name: string) => void }) {
  const [name, setName] = useState("");
  return (
    <div className="flex items-center gap-2 border-t pt-3">
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Add a new category..." className="flex-1" />
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
