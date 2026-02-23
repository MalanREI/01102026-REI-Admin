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

type AttendanceRow = {
  full_name: string | null;
  email: string | null;
  is_present: boolean;
  is_guest: boolean;
};

type MilestoneRow = {
  title: string;
  target_date: string | null;
  status: string;
  priority: string;
  owner_name: string;
  description: string | null;
};

type OngoingNoteRow = {
  title: string;
  content: string | null;
  category: string | null;
};

async function buildPdf(opts: {
  meetingTitle: string;
  meetingDateLabel: string;
  meetingTimeLabel: string;
  meetingLocation: string;
  infoRows: Array<[string, string]>;
  attendeesValue: string;
  agenda: AgendaPdfRow[];
  tasks: TaskRow[];
  referenceLink?: string | null;
  attendanceData: AttendanceRow[];
  milestones: MilestoneRow[];
  ongoingNotes: OngoingNoteRow[];
}) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  // Green color palette
  const GREEN_DARK = rgb(0.18, 0.49, 0.20);
  const GREEN_LIGHT = rgb(0.91, 0.96, 0.91);
  const GREEN_ACCENT = rgb(0.26, 0.63, 0.28);
  const TEXT_DARK = rgb(0.1, 0.1, 0.1);
  const TEXT_GRAY = rgb(0.45, 0.45, 0.45);

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

  /** Draws a green filled rectangle with white bold text as a section header. */
  const drawSectionHeader = (label: string) => {
    const barH = 24;
    ensureSpace(barH + 10);
    page.drawRectangle({
      x: MARGIN_X,
      y: y - barH,
      width: CONTENT_W,
      height: barH,
      color: GREEN_DARK,
    });
    drawText(label, MARGIN_X + 10, y - 17, 11, true, rgb(1, 1, 1));
    y -= barH + 8;
  };

  /** Draws a small colored badge for milestone/task statuses. */
  const drawStatusBadge = (status: string, x: number, yPos: number) => {
    const normalized = status.toLowerCase().trim();
    let bgColor: RGB;
    if (normalized === "completed" || normalized === "complete" || normalized === "done") {
      bgColor = rgb(0.18, 0.49, 0.20);
    } else if (normalized === "in progress" || normalized === "in-progress" || normalized === "active") {
      bgColor = rgb(0.16, 0.38, 0.70);
    } else if (normalized === "delayed" || normalized === "overdue" || normalized === "blocked") {
      bgColor = rgb(0.80, 0.26, 0.18);
    } else {
      bgColor = rgb(0.55, 0.55, 0.55);
    }
    const textW = font.widthOfTextAtSize(status, 8);
    const padX = 6;
    const badgeW = textW + padX * 2;
    const badgeH = 14;
    page.drawRectangle({
      x,
      y: yPos - 3,
      width: badgeW,
      height: badgeH,
      color: bgColor,
    });
    page.drawText(status, { x: x + padX, y: yPos, size: 8, font, color: rgb(1, 1, 1) });
    return badgeW;
  };

  // ===== HEADER =====
  const headerTitle = opts.meetingTitle;
  const titleSize = 18;
  const dateSize = 11;

  const titleW = bold.widthOfTextAtSize(headerTitle, titleSize);
  const dateStr = opts.meetingDateLabel + (opts.meetingTimeLabel ? "  •  " + opts.meetingTimeLabel : "");
  const dateW = font.widthOfTextAtSize(dateStr, dateSize);

  ensureSpace(50);
  drawText(headerTitle, (PAGE_W - titleW) / 2, y, titleSize, true, GREEN_DARK);
  y -= 18;
  drawText(dateStr, (PAGE_W - dateW) / 2, y, dateSize, false, TEXT_GRAY);
  y -= 14;

  // Green accent bar
  page.drawRectangle({
    x: MARGIN_X,
    y: y - 3,
    width: CONTENT_W,
    height: 3,
    color: GREEN_ACCENT,
  });
  y -= 18;

  // ===== INFO TABLE =====
  const tableX = MARGIN_X;
  const tableW = CONTENT_W;
  const rowH = 22;
  const labelW = 110;

  const rows: Array<[string, string]> = [...opts.infoRows, ["ATTENDEES", opts.attendeesValue]];
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

    // Light green header for the label column
    page.drawRectangle({ x: tableX, y: ry, width: labelW, height: rowH, color: GREEN_LIGHT });
    page.drawLine({
      start: { x: tableX + labelW, y: ry },
      end: { x: tableX + labelW, y: ry + rowH },
      thickness: 1,
      color: rgb(0.75, 0.75, 0.75),
    });

    const [lab, val] = rows[i]!;
    drawText(lab, tableX + 8, ry + 7, 10, true, GREEN_DARK);
    drawText(clampText(val, 120), tableX + labelW + 8, ry + 7, 10, false, TEXT_DARK);
  }

  y -= tableH + 22;

  // ===== ATTENDANCE =====
  drawSectionHeader("ATTENDANCE");

  const present = opts.attendanceData.filter((a) => a.is_present && !a.is_guest);
  const absent = opts.attendanceData.filter((a) => !a.is_present && !a.is_guest);
  const guests = opts.attendanceData.filter((a) => a.is_guest);

  if (opts.attendanceData.length === 0) {
    ensureSpace(20);
    drawText("No attendance data recorded.", MARGIN_X + 10, y, 9, false, TEXT_GRAY);
    y -= 20;
  } else {
    const drawAttendeeList = (label: string, items: AttendanceRow[], dotColor: RGB) => {
      if (items.length === 0) return;
      ensureSpace(20);
      drawText(label, MARGIN_X + 10, y, 9, true, TEXT_DARK);
      y -= 14;
      for (const att of items) {
        ensureSpace(14);
        // Colored dot indicator
        page.drawCircle({ x: MARGIN_X + 18, y: y + 3, size: 3, color: dotColor });
        const name = (att.full_name ?? "").trim() || (att.email ?? "").trim() || "Unknown";
        drawText(name, MARGIN_X + 28, y, 9, false, TEXT_DARK);
        y -= 14;
      }
      y -= 4;
    };

    drawAttendeeList("Present", present, rgb(0.18, 0.49, 0.20));
    drawAttendeeList("Absent", absent, TEXT_GRAY);
    drawAttendeeList("Guests", guests, rgb(0.16, 0.38, 0.70));
  }

  y -= 6;

  // ===== MILESTONES =====
  drawSectionHeader("MILESTONES");

  if (opts.milestones.length === 0) {
    ensureSpace(20);
    drawText("No milestones defined.", MARGIN_X + 10, y, 9, false, TEXT_GRAY);
    y -= 20;
  } else {
    // Column headers
    const msColTitle = MARGIN_X + 10;
    const msColDate = MARGIN_X + 220;
    const msColStatus = MARGIN_X + 310;
    const msColPriority = MARGIN_X + 400;
    const msColOwner = MARGIN_X + 450;

    ensureSpace(18);
    drawText("Title", msColTitle, y, 8, true, TEXT_GRAY);
    drawText("Target Date", msColDate, y, 8, true, TEXT_GRAY);
    drawText("Status", msColStatus, y, 8, true, TEXT_GRAY);
    drawText("Priority", msColPriority, y, 8, true, TEXT_GRAY);
    drawText("Owner", msColOwner, y, 8, true, TEXT_GRAY);
    y -= 4;
    drawHr(y);
    y -= 12;

    for (const ms of opts.milestones) {
      const isCompleted = ms.status.toLowerCase() === "completed" || ms.status.toLowerCase() === "done";
      const titleColor = isCompleted ? TEXT_GRAY : TEXT_DARK;

      // Estimate height: title may wrap
      const titleLines = wrapText({ text: ms.title, font: bold, size: 9, maxWidth: 200 });
      const descLines = ms.description
        ? wrapText({ text: ms.description, font, size: 8, maxWidth: CONTENT_W - 20 }).slice(0, 2)
        : [];
      const neededH = titleLines.length * 12 + descLines.length * 10 + 16;
      ensureSpace(neededH);

      // Title (may wrap)
      for (const tl of titleLines) {
        drawText(tl, msColTitle, y, 9, true, titleColor);
        y -= 12;
      }
      y += 12; // go back to first line for inline fields

      drawText(ms.target_date ?? "—", msColDate, y, 9, false, TEXT_DARK);
      drawStatusBadge(ms.status, msColStatus, y);
      drawText(ms.priority, msColPriority, y, 9, false, TEXT_DARK);
      drawText(clampText(ms.owner_name, 30), msColOwner, y, 9, false, TEXT_DARK);
      y -= 12 * Math.max(0, titleLines.length - 1); // move down for multi-line titles

      if (descLines.length > 0) {
        y -= 2;
        for (const dl of descLines) {
          drawText(dl, msColTitle + 8, y, 8, false, TEXT_GRAY);
          y -= 10;
        }
      }
      y -= 6;
      drawHr(y);
      y -= 10;
    }
  }

  y -= 6;

  // ===== ACTIVE TASKS (2 columns, grouped by category) =====
  drawSectionHeader("ACTIVE TASKS");

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

  if (opts.tasks.length === 0) {
    ensureSpace(20);
    drawText("No active tasks.", MARGIN_X + 10, y, 9, false, TEXT_GRAY);
    y -= 20;
    leftY = y;
    rightY = y;
  }

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
    const headerH = 20;
    const lineH = 10;
    const bodyH = Math.max(28, contentLines.length * lineH + 10);
    const totalH = headerH + bodyH;

    drawBox(x, yTop, taskColW, totalH, rgb(0.985, 0.985, 0.985));
    // Green header stripe
    page.drawRectangle({ x, y: yTop - headerH, width: taskColW, height: headerH, color: GREEN_LIGHT });
    drawText(titleLines[0] ?? cat, x + 8, yTop - 14, 10, true, GREEN_DARK);

    let cy = yTop - headerH - 14;
    for (const ln of contentLines) {
      if (!ln) {
        cy -= lineH;
        continue;
      }
      if (cy < yTop - totalH + 10) break;
      drawText(ln, x + 10, cy, 8, false, TEXT_DARK);
      cy -= lineH;
    }

    return totalH;
  };

  const commitTasksBlock = () => {
    y = Math.min(leftY, rightY) - 10;
  };

  for (const cat of categories) {
    const items = group.get(cat) ?? [];
    const rough = 20 + Math.min(240, 40 + items.length * 40);

    if (Math.min(leftY, rightY) - rough < BOTTOM) {
      newPage();
      drawSectionHeader("ACTIVE TASKS (cont.)");
      leftY = y;
      rightY = y;
    }

    const useLeft = leftY >= rightY;
    const x = useLeft ? MARGIN_X : MARGIN_X + taskColW + taskColGap;
    const yTop = useLeft ? leftY : rightY;

    if (yTop - 80 < BOTTOM) {
      newPage();
      drawSectionHeader("ACTIVE TASKS (cont.)");
      leftY = y;
      rightY = y;
    }

    const h = drawCategory(useLeft ? MARGIN_X : MARGIN_X + taskColW + taskColGap, useLeft ? leftY : rightY, cat, items);
    if (useLeft) leftY -= h + 10;
    else rightY -= h + 10;
  }

  if (categories.length > 0) {
    commitTasksBlock();
  }
  y -= 6;

  // ===== DISCUSSION NOTES (side-by-side, multi-page) =====
  drawSectionHeader("DISCUSSION NOTES");

  const gap = 10;
  const colW = (CONTENT_W - gap) / 2;

  if (opts.agenda.length === 0) {
    ensureSpace(20);
    drawText("No agenda items.", MARGIN_X + 10, y, 9, false, TEXT_GRAY);
    y -= 20;
  }

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
    const boxBodyH = Math.max(60, Math.min(320, maxLines * lineH + 28));
    const boxH = boxBodyH;

    const needed = headerH + boxH + 14;
    ensureSpace(needed);

    // Agenda item header box with green tint
    drawBox(MARGIN_X, y, CONTENT_W, headerH, GREEN_LIGHT);
    drawText(row.label, MARGIN_X + 10, y - 15, 10, true, GREEN_DARK);
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
      drawText(ln, leftX + 8, ly, 9, false, TEXT_DARK);
      ly -= lineH;
    }

    let ry = y - 30;
    for (const ln of rightLines) {
      if (ry < y - boxH + 10) break;
      drawText(ln, rightX + 8, ry, 9, false, TEXT_DARK);
      ry -= lineH;
    }

    y -= boxH + 14;
  };

  for (const a of opts.agenda) {
    drawAgendaSection(a);
  }

  // ===== ONGOING NOTES =====
  drawSectionHeader("ONGOING NOTES");

  if (opts.ongoingNotes.length === 0) {
    ensureSpace(20);
    drawText("No ongoing notes.", MARGIN_X + 10, y, 9, false, TEXT_GRAY);
    y -= 20;
  } else {
    for (const note of opts.ongoingNotes) {
      const titleLines = wrapText({ text: note.title, font: bold, size: 10, maxWidth: CONTENT_W - 20 });
      const contentLines = note.content
        ? wrapText({ text: normalizeNotes(note.content), font, size: 9, maxWidth: CONTENT_W - 30 })
        : [];
      const categoryLine = note.category ? `Category: ${note.category}` : "";

      const neededH = titleLines.length * 13 + contentLines.length * 11 + (categoryLine ? 14 : 0) + 20;
      ensureSpace(neededH);

      // Title
      for (const tl of titleLines) {
        drawText(tl, MARGIN_X + 10, y, 10, true, TEXT_DARK);
        y -= 13;
      }

      // Category tag
      if (categoryLine) {
        drawText(categoryLine, MARGIN_X + 10, y, 8, false, GREEN_ACCENT);
        y -= 14;
      }

      // Content
      if (contentLines.length > 0) {
        for (const cl of contentLines) {
          drawText(cl, MARGIN_X + 16, y, 9, false, TEXT_DARK);
          y -= 11;
        }
      } else {
        drawText("(No content)", MARGIN_X + 16, y, 9, false, TEXT_GRAY);
        y -= 11;
      }

      y -= 6;
      drawHr(y);
      y -= 10;
    }
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

  // ===== PAGE NUMBERS =====
  const allPages = pdf.getPages();
  const totalPages = allPages.length;
  for (let i = 0; i < totalPages; i++) {
    const pg = allPages[i]!;
    const pageNumText = `Page ${i + 1} of ${totalPages}`;
    const pageNumW = font.widthOfTextAtSize(pageNumText, 8);
    pg.drawText(pageNumText, {
      x: (PAGE_W - pageNumW) / 2,
      y: 28,
      size: 8,
      font,
      color: TEXT_GRAY,
    });

    const brandText = "Generated by Alan's Workspace";
    const brandW = font.widthOfTextAtSize(brandText, 7);
    pg.drawText(brandText, {
      x: (PAGE_W - brandW) / 2,
      y: 18,
      size: 7,
      font,
      color: TEXT_GRAY,
    });
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

    // Fetch milestones
    const milestonesRes = await admin
      .from("meeting_milestones")
      .select("id,title,description,target_date,status,priority,owner_id,owner_email,owner_name,position")
      .eq("meeting_id", meetingId)
      .order("position", { ascending: true });

    const milestones = (milestonesRes.data ?? []).map((m: { title?: string; target_date?: string; status?: string; priority?: string; owner_name?: string; owner_id?: string; description?: string }) => ({
      title: String(m.title ?? ""),
      target_date: m.target_date ? String(m.target_date) : null,
      status: String(m.status ?? "Pending"),
      priority: String(m.priority ?? "Normal"),
      owner_name: String(m.owner_name ?? "").trim() || (m.owner_id ? String(ownerById.get(String(m.owner_id)) ?? "") : "") || "Unassigned",
      description: m.description ? String(m.description) : null,
    }));

    // Fetch ongoing notes
    const ongoingNotesRes = await admin
      .from("meeting_ongoing_notes")
      .select("id,title,content,category,position")
      .eq("meeting_id", meetingId)
      .order("position", { ascending: true });

    const ongoingNotes = (ongoingNotesRes.data ?? []).map((n: { title?: string; content?: string; category?: string }) => ({
      title: String(n.title ?? ""),
      content: n.content ? String(n.content) : null,
      category: n.category ? String(n.category) : null,
    }));

    // Fetch session attendance
    const attendanceRes = await admin
      .from("meeting_session_attendees")
      .select("email,full_name,is_present,is_guest")
      .eq("session_id", sessionId);

    const attendanceData: AttendanceRow[] = (attendanceRes.data ?? []).map((a: { email?: string; full_name?: string; is_present?: boolean; is_guest?: boolean }) => ({
      full_name: a.full_name ? String(a.full_name) : null,
      email: a.email ? String(a.email) : null,
      is_present: Boolean(a.is_present),
      is_guest: Boolean(a.is_guest),
    }));

    // Build PDF
    const meeting = meetingRes.data;
    const start = new Date(meeting.start_at);
    const dateLabel = start.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
    const timeLabel = `${start.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;

    const pdfBytes = await buildPdf({
      meetingTitle: meeting.title,
      meetingDateLabel: dateLabel,
      meetingTimeLabel: timeLabel,
      meetingLocation: String(meeting.location ?? ""),
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
      attendanceData,
      milestones,
      ongoingNotes,
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
