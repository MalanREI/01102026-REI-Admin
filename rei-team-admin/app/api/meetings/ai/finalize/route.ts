import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb, PDFFont, RGB } from "pdf-lib";
import { supabaseAdmin } from "@/src/lib/supabase/admin";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

function requireInternalToken(req: Request) {
  const expected = process.env.INTERNAL_JOB_TOKEN;
  if (!expected) return; // if unset, allow (useful for local dev)
  const got = req.headers.get("x-internal-token") || "";
  if (got !== expected) {
    throw new Error("Unauthorized");
  }
}

type AgendaPdfRow = {
  label: string;
  notes: string;
  prevNotes: string;
};

function clampText(s: string, maxLen: number): string {
  const t = (s ?? "").trim();
  if (t.length <= maxLen) return t;
  return t.slice(0, maxLen - 1) + "…";
}

function normalizeNotes(s: string | null | undefined): string {
  return (s ?? "").replace(/\r\n/g, "\n").trim();
}

/**
 * Very small word-wrap helper for pdf-lib.
 */
function wrapText(opts: { text: string; font: PDFFont; size: number; maxWidth: number }): string[] {
  const text = (opts.text ?? "").replace(/\r\n/g, "\n");
  const paras = text.split("\n");
  const lines: string[] = [];

  for (const para of paras) {
    const words = para.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push("");
      continue;
    }

    let cur = words[0]!;
    for (let i = 1; i < words.length; i++) {
      const w = words[i]!;
      const test = cur + " " + w;
      const width = opts.font.widthOfTextAtSize(test, opts.size);
      if (width <= opts.maxWidth) {
        cur = test;
      } else {
        lines.push(cur);
        cur = w;
      }
    }
    lines.push(cur);
  }

  return lines;
}

type TaskRow = {
  title: string;
  meta: string;
  notes?: string | null;
  latestComment?: string | null;
  columnName: string;
};

async function buildPdf(opts: {
  meetingTitle: string;
  meetingDateLabel: string;
  infoRows: Array<[string, string]>;
  attendeesValue: string;
  agenda: AgendaPdfRow[];
  tasks: TaskRow[];
  referenceLink?: string | null;
}) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  // US Letter portrait
  const PAGE_W = 612;
  const PAGE_H = 792;
  const MARGIN_X = 46;
  const TOP = PAGE_H - 54;
  const BOTTOM = 56;
  const CONTENT_W = PAGE_W - MARGIN_X * 2;

  let page = pdf.addPage([PAGE_W, PAGE_H]);
  let y = TOP;

  const newPage = () => {
    page = pdf.addPage([PAGE_W, PAGE_H]);
    y = TOP;
  };

  const ensureSpace = (need: number) => {
    if (y - need < BOTTOM) newPage();
  };

  const drawText = (t: string, x: number, yPos: number, size: number, isBold = false, color?: RGB) => {
    const f = isBold ? bold : font;
    page.drawText(t, { x, y: yPos, size, font: f, color: color ?? rgb(0, 0, 0) });
  };

  const drawHr = (yPos: number) => {
    page.drawLine({
      start: { x: MARGIN_X, y: yPos },
      end: { x: PAGE_W - MARGIN_X, y: yPos },
      thickness: 1,
      color: rgb(0.8, 0.8, 0.8),
    });
  };

  const drawBox = (x: number, yTop: number, w: number, h: number, fill?: RGB) => {
    page.drawRectangle({
      x,
      y: yTop - h,
      width: w,
      height: h,
      borderWidth: 1,
      borderColor: rgb(0.85, 0.85, 0.85),
      color: fill ?? rgb(1, 1, 1),
    });
  };

  // ===== HEADER (centered) =====
  const headerTitle = opts.meetingTitle;
  const headerDate = opts.meetingDateLabel;

  const titleSize = 16;
  const dateSize = 11;

  const titleW = bold.widthOfTextAtSize(headerTitle, titleSize);
  const dateW = font.widthOfTextAtSize(`- ${headerDate}`, dateSize);

  ensureSpace(40);

  drawText(headerTitle, (PAGE_W - titleW) / 2, y, titleSize, true, rgb(0.2, 0.5, 0.2));
  drawText(`- ${headerDate}`, (PAGE_W - dateW) / 2, y - 15, dateSize, false, rgb(0.1, 0.1, 0.1));
  y -= 30;
  drawHr(y);
  y -= 18;

  // ===== INFO TABLE =====
  const tableX = MARGIN_X;
  const tableW = CONTENT_W;
  const rowH = 22;
  const labelW = 110;

  const rows: Array<[string, string]> = [...opts.infoRows, ["ATTENDEES", opts.attendeesValue]];

  // Calculate table height. Attendees may wrap; we keep it to one line in table and full list in footer if needed.
  const tableH = rows.length * rowH;

  ensureSpace(tableH + 14);

  page.drawRectangle({
    x: tableX,
    y: y - tableH,
    width: tableW,
    height: tableH,
    borderWidth: 1,
    borderColor: rgb(0.75, 0.75, 0.75),
  });

  for (let i = 0; i < rows.length; i++) {
    const ry = y - rowH * (i + 1);
    if (i > 0) {
      page.drawLine({
        start: { x: tableX, y: ry + rowH },
        end: { x: tableX + tableW, y: ry + rowH },
        thickness: 1,
        color: rgb(0.75, 0.75, 0.75),
      });
    }

    page.drawRectangle({ x: tableX, y: ry, width: labelW, height: rowH, color: rgb(0.95, 0.95, 0.95) });
    page.drawLine({
      start: { x: tableX + labelW, y: ry },
      end: { x: tableX + labelW, y: ry + rowH },
      thickness: 1,
      color: rgb(0.75, 0.75, 0.75),
    });

    const [lab, val] = rows[i]!;
    drawText(lab, tableX + 8, ry + 7, 10, true);
    drawText(clampText(val, 120), tableX + labelW + 8, ry + 7, 10, false);
  }

  y -= tableH + 22;

  // ===== ACTIVE TASKS (2 columns, grouped by category) =====
  drawText("ACTIVE TASKS", MARGIN_X, y, 12, true, rgb(0.2, 0.5, 0.2));
  y -= 14;

  const taskColGap = 14;
  const taskColW = (CONTENT_W - taskColGap) / 2;
  let leftY = y;
  let rightY = y;

  // group tasks by columnName (category)
  const group = new Map<string, TaskRow[]>();
  for (const t of opts.tasks) {
    const key = t.columnName || "Uncategorized";
    if (!group.has(key)) group.set(key, []);
    group.get(key)!.push(t);
  }

  const categories = Array.from(group.keys()).sort((a, b) => a.localeCompare(b));

  const drawCategory = (x: number, yTop: number, cat: string, items: TaskRow[]) => {
    const titleLines = wrapText({ text: cat, font: bold, size: 10, maxWidth: taskColW - 16 });

    const lines: string[] = [];
    for (const it of items) {
      const title = it.title?.trim() || "";
      const meta = it.meta?.trim() || "";
      const note = (it.notes ?? "").trim();
      const comm = (it.latestComment ?? "").trim();

      const tLines = wrapText({ text: title, font: bold, size: 9, maxWidth: taskColW - 18 });
      const mLines = wrapText({ text: meta, font, size: 8, maxWidth: taskColW - 18 });

      lines.push(...tLines.map((l) => `• ${l}`));
      lines.push(...mLines.map((l) => `  ${l}`));

      if (note) {
        const nLines = wrapText({ text: `Notes: ${note}`, font, size: 8, maxWidth: taskColW - 18 }).slice(0, 2);
        lines.push(...nLines.map((l) => `  ${l}`));
      }
      if (comm) {
        const cLines = wrapText({ text: `Latest: ${comm}`, font, size: 8, maxWidth: taskColW - 18 }).slice(0, 2);
        lines.push(...cLines.map((l) => `  ${l}`));
      }

      lines.push(""); // spacer
    }

    const contentLines = lines.length ? lines : ["(none)"];
    const headerH = 18;
    const lineH = 10;
    const bodyH = Math.max(28, contentLines.length * lineH + 10);
    const totalH = headerH + bodyH;

    drawBox(x, yTop, taskColW, totalH, rgb(0.985, 0.985, 0.985));
    // header stripe
    page.drawRectangle({ x, y: yTop - headerH, width: taskColW, height: headerH, color: rgb(0.95, 0.98, 0.95) });
    drawText(titleLines[0] ?? cat, x + 8, yTop - 13, 10, true, rgb(0.15, 0.35, 0.15));

    let cy = yTop - headerH - 14;
    for (const ln of contentLines) {
      if (!ln) {
        cy -= lineH;
        continue;
      }
      if (cy < yTop - totalH + 10) break;
      drawText(ln, x + 10, cy, 8, false, rgb(0.1, 0.1, 0.1));
      cy -= lineH;
    }

    return totalH;
  };

  const commitTasksBlock = () => {
    // after drawing into the two columns, set y below whichever is lower.
    y = Math.min(leftY, rightY) - 10;
  };

  for (const cat of categories) {
    const items = group.get(cat) ?? [];

    // Estimate needed height on a scratch basis (rough). We'll compute accurate after wrap.
    const rough = 18 + Math.min(240, 40 + items.length * 40);

    // If both columns would overflow, page break (and reset both columns)
    if (Math.min(leftY, rightY) - rough < BOTTOM) {
      newPage();
      // re-draw section title at top of new page if tasks continued
      drawText("ACTIVE TASKS (cont.)", MARGIN_X, y, 12, true, rgb(0.2, 0.5, 0.2));
      y -= 14;
      leftY = y;
      rightY = y;
    }

    // Choose the shorter column
    const useLeft = leftY >= rightY;
    const x = useLeft ? MARGIN_X : MARGIN_X + taskColW + taskColGap;
    const yTop = useLeft ? leftY : rightY;

    // Ensure some minimal space; otherwise new page and reset
    if (yTop - 80 < BOTTOM) {
      newPage();
      drawText("ACTIVE TASKS (cont.)", MARGIN_X, y, 12, true, rgb(0.2, 0.5, 0.2));
      y -= 14;
      leftY = y;
      rightY = y;
    }

    const h = drawCategory(x, yTop, cat, items);
    if (useLeft) leftY -= h + 10;
    else rightY -= h + 10;
  }

  commitTasksBlock();
  y -= 6;

  // ===== DISCUSSION NOTES (side-by-side, multi-page) =====
  ensureSpace(24);
  drawText("DISCUSSION NOTES", MARGIN_X, y, 12, true, rgb(0.2, 0.5, 0.2));
  y -= 16;

  const gap = 10;
  const colW = (CONTENT_W - gap) / 2;

  const drawAgendaSection = (row: AgendaPdfRow) => {
    const headerH = 22;

    const leftTitle = "Meeting Notes";
    const rightTitle = "Previous Notes";

    const leftLines = wrapText({
      text: normalizeNotes(row.notes) || "(No notes)",
      font,
      size: 9,
      maxWidth: colW - 16,
    });
    const rightLines = wrapText({
      text: normalizeNotes(row.prevNotes) || "(No previous notes)",
      font,
      size: 9,
      maxWidth: colW - 16,
    });

    const maxLines = Math.max(leftLines.length, rightLines.length);
    const lineH = 11;
    const boxBodyH = Math.max(60, Math.min(320, maxLines * lineH + 28)); // clamp so it stays readable
    const boxH = boxBodyH;

    const needed = headerH + boxH + 14;
    ensureSpace(needed);

    // Section header box
    drawBox(MARGIN_X, y, CONTENT_W, headerH, rgb(0.95, 0.98, 0.95));
    drawText(row.label, MARGIN_X + 10, y - 15, 10, true, rgb(0.1, 0.25, 0.1));
    y -= headerH + 8;

    // Left + right boxes
    const leftX = MARGIN_X;
    const rightX = MARGIN_X + colW + gap;

    drawBox(leftX, y, colW, boxH, rgb(1, 1, 1));
    drawBox(rightX, y, colW, boxH, rgb(1, 1, 1));

    // Titles
    drawText(leftTitle, leftX + 8, y - 14, 8, true, rgb(0.25, 0.25, 0.25));
    drawText(rightTitle, rightX + 8, y - 14, 8, true, rgb(0.25, 0.25, 0.25));

    // Content
    let ly = y - 30;
    for (const ln of leftLines) {
      if (ly < y - boxH + 10) break;
      drawText(ln, leftX + 8, ly, 9, false, rgb(0.1, 0.1, 0.1));
      ly -= lineH;
    }

    let ry = y - 30;
    for (const ln of rightLines) {
      if (ry < y - boxH + 10) break;
      drawText(ln, rightX + 8, ry, 9, false, rgb(0.1, 0.1, 0.1));
      ry -= lineH;
    }

    y -= boxH + 14;
  };

  for (const a of opts.agenda) {
    drawAgendaSection(a);
  }

  // ===== FOOTER (reference link) =====
  if (opts.referenceLink) {
    ensureSpace(40);
    drawHr(y);
    y -= 16;
    drawText("Reference link:", MARGIN_X, y, 9, true, rgb(0.2, 0.2, 0.2));
    drawText(clampText(opts.referenceLink, 140), MARGIN_X + 92, y, 9, false, rgb(0.1, 0.3, 0.8));
    y -= 12;
  }

  return pdf.save();
}

export async function POST(req: Request) {
  try {
    requireInternalToken(req);

    const body = (await req.json()) as {
      meetingId?: string;
      sessionId?: string;
    };

    const meetingId = String(body.meetingId ?? "").trim();
    const sessionId = String(body.sessionId ?? "").trim();

    if (!meetingId || !sessionId) {
      return NextResponse.json({ error: "meetingId + sessionId required" }, { status: 400 });
    }

    const admin = supabaseAdmin();

    // Fetch meeting + attendees (include names)
    const meetingRes = await admin
      .from("meetings")
      .select("id,title,location,start_at")
      .eq("id", meetingId)
      .single();
    if (meetingRes.error) throw meetingRes.error;

    const attendeesRes = await admin
      .from("meeting_attendees")
      .select("email,full_name,user_id")
      .eq("meeting_id", meetingId)
      .order("created_at", { ascending: true });
    if (attendeesRes.error) throw attendeesRes.error;

    const attendeeLabel = (attendeesRes.data ?? [])
      .map((a: { full_name?: string; email?: string }) => String(a.full_name ?? "").trim() || String(a.email ?? "").trim())
      .filter(Boolean);

    const emailToName = new Map<string, string>();
    for (const a of attendeesRes.data ?? []) {
      const typedA = a as { email?: string; full_name?: string };
      const e = String(typedA.email ?? "").trim().toLowerCase();
      const n = String(typedA.full_name ?? "").trim();
      if (e) emailToName.set(e, n || e);
    }

    // Current notes
    const agendaRes = await admin
      .from("meeting_agenda_items")
      .select("id,code,title,description,position")
      .eq("meeting_id", meetingId)
      .order("position", { ascending: true });
    if (agendaRes.error) throw agendaRes.error;

    const notesRes = await admin
      .from("meeting_agenda_notes")
      .select("agenda_item_id,notes")
      .eq("session_id", sessionId);
    if (notesRes.error) throw notesRes.error;

    const notesMap: Record<string, string> = {};
    for (const r of notesRes.data ?? []) {
      const typedR = r as { agenda_item_id: string; notes?: string };
      notesMap[String(typedR.agenda_item_id)] = String(typedR.notes ?? "");
    }

    // Previous session notes
    const prevSessionRes = await admin
      .from("meeting_minutes_sessions")
      .select("id,ended_at,started_at")
      .eq("meeting_id", meetingId)
      .neq("id", sessionId)
      .not("ended_at", "is", null)
      .order("ended_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const prevSessionId = !prevSessionRes.error && prevSessionRes.data?.id ? String(prevSessionRes.data.id) : null;

    const prevNotesMap: Record<string, string> = {};
    if (prevSessionId) {
      const prevNotesRes = await admin
        .from("meeting_agenda_notes")
        .select("agenda_item_id,notes")
        .eq("session_id", prevSessionId);
      if (prevNotesRes.error) throw prevNotesRes.error;
      for (const r of prevNotesRes.data ?? []) {
        const typedR = r as { agenda_item_id: string; notes?: string };
        prevNotesMap[String(typedR.agenda_item_id)] = String(typedR.notes ?? "");
      }
    }

    // OPEN tasks only (no Completed)
    const tasksRes = await admin
      .from("meeting_tasks")
      .select("id,title,status,priority,owner_id,owner_email,owner_name,due_date,notes,column_id")
      .eq("meeting_id", meetingId)
      .neq("status", "Completed");
    if (tasksRes.error) throw tasksRes.error;

    const colsRes = await admin.from("meeting_task_columns").select("id,name").eq("meeting_id", meetingId);
    if (colsRes.error) throw colsRes.error;

    const profRes = await admin.from("profiles").select("id,full_name,email");
    if (profRes.error) throw profRes.error;

    const colName = new Map((colsRes.data ?? []).map((c: { id: string; name: string }) => [String(c.id), String(c.name)]));
    const ownerById = new Map(
      (profRes.data ?? []).map((p: { id: string; full_name?: string; email?: string }) => [
        String(p.id),
        String(p.full_name?.trim() || p.email?.trim() || "Unassigned"),
      ])
    );
    const emailById = new Map((profRes.data ?? []).map((p: { id: string; email?: string }) => [String(p.id), String(p.email ?? "").trim()]));

    // Latest comment per task (from events)
    const taskIds = (tasksRes.data ?? []).map((t: { id: string }) => String(t.id)).filter(Boolean);
    const latestCommentByTask = new Map<string, string>();
    if (taskIds.length) {
      const evRes = await admin
        .from("meeting_task_events")
        .select("task_id,event_type,payload,created_at")
        .in("task_id", taskIds)
        .eq("event_type", "comment")
        .order("created_at", { ascending: false });
      if (!evRes.error) {
        for (const ev of evRes.data ?? []) {
          const typedEv = ev as { task_id: string; payload?: { text?: string } };
          const tid = String(typedEv.task_id);
          if (!latestCommentByTask.has(tid)) {
            const text = String(typedEv.payload?.text ?? "").trim();
            if (text) latestCommentByTask.set(tid, text);
          }
        }
      }
    }

    type TaskData = {
      id: string;
      title?: string;
      status?: string;
      priority?: string;
      owner_id?: string;
      owner_email?: string;
      owner_name?: string;
      due_date?: string;
      notes?: string;
      column_id?: string;
    };

    const tasks: TaskRow[] = (tasksRes.data ?? []).map((t: TaskData) => {
      const col = colName.get(String(t.column_id)) ?? "Uncategorized";

      // owner priority:
      // 1) explicit owner_name
      // 2) owner_id -> profiles
      // 3) owner_email -> meeting attendees name
      const ownerEmail = String(t.owner_email ?? "").trim().toLowerCase() || (t.owner_id ? String(emailById.get(String(t.owner_id)) ?? "").trim().toLowerCase() : "");
      const ownerName =
        String(t.owner_name ?? "").trim() ||
        (t.owner_id ? String(ownerById.get(String(t.owner_id)) ?? "") : "") ||
        (ownerEmail ? String(emailToName.get(ownerEmail) ?? ownerEmail) : "") ||
        "Unassigned";

      const due = t.due_date ? " | Due: " + String(t.due_date) : "";

      const meta = `${col} | ${String(t.status ?? "")} | ${String(t.priority ?? "")} | ${ownerName}${due}`;

      return {
        title: String(t.title ?? ""),
        meta,
        notes: String(t.notes ?? "").trim() || null,
        latestComment: latestCommentByTask.get(String(t.id)) ?? null,
        columnName: col,
      };
    });

    const agenda: AgendaPdfRow[] = (agendaRes.data ?? []).map((a: { id: string; code?: string; title?: string }) => ({
      label: `${a.code ? a.code + " - " : ""}${String(a.title ?? "")}`,
      notes: String(notesMap[String(a.id)] ?? "").trim(),
      prevNotes: String(prevNotesMap[String(a.id)] ?? "").trim(),
    }));

    // Reference link stored on the session (written by conclude)
    const sessionRes = await admin
      .from("meeting_minutes_sessions")
      .select("reference_link")
      .eq("id", sessionId)
      .maybeSingle();
    const referenceLink = !sessionRes.error ? sessionRes.data?.reference_link ?? null : null;

    // Build PDF
    const meeting = meetingRes.data;
    const start = new Date(meeting.start_at);
    const dateLabel = start.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
    const timeLabel = `${start.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;

    const pdfBytes = await buildPdf({
      meetingTitle: meeting.title,
      meetingDateLabel: dateLabel,
      infoRows: [
        ["ID", sessionId],
        ["NAME", meeting.title],
        ["DATE", dateLabel],
        ["TIME", timeLabel],
      ],
      attendeesValue: attendeeLabel.join(", "),
      agenda,
      tasks,
      referenceLink,
    });

    // Upload PDF
    const pdfBucket = requireEnv("MINUTES_PDF_BUCKET");
    const pdfPath = `meetings/${meetingId}/sessions/${sessionId}/minutes.pdf`;

    const upPdf = await admin.storage.from(pdfBucket).upload(pdfPath, pdfBytes, {
      contentType: "application/pdf",
      upsert: true,
    });
    if (upPdf.error) throw upPdf.error;

    // Save PDF path
    const updSession = await admin.from("meeting_minutes_sessions").update({ pdf_path: pdfPath }).eq("id", sessionId);
    if (updSession.error) throw updSession.error;

    // Signed URL (optional)
    let pdfUrl: string | null = null;
    try {
      const signed = await admin.storage.from(pdfBucket).createSignedUrl(pdfPath, 60 * 60 * 24 * 30);
      if (!signed.error) pdfUrl = signed.data?.signedUrl ?? null;
    } catch {
      // ignore
    }

    // Mark email as ready to send (manual send endpoint handles delivery)
    try {
      const mark = await admin
        .from("meeting_minutes_sessions")
        .update({ email_status: "ready", email_error: null })
        .eq("id", sessionId);
      // ignore if column doesn't exist yet
      if (mark.error && String(mark.error.message || "").includes("email_status")) {
        // no-op
      }
    } catch {
      // ignore
    }

    return NextResponse.json({ ok: true, pdfPath, pdfUrl });
  } catch (e: unknown) {
    const errorMessage = (e as Error)?.message || "";
    const status = String(errorMessage).toLowerCase().includes("unauthorized") ? 401 : 500;
    return NextResponse.json({ error: errorMessage || "Finalize failed" }, { status });
  }
}
