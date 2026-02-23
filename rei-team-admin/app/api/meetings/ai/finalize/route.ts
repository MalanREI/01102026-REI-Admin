import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb, PDFFont, RGB } from "pdf-lib";
import { supabaseAdmin } from "@/src/lib/supabase/admin";
import { APP_NAME } from "@/src/config/app.config";

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
  status?: string;
  priority?: string;
  ownerName?: string;
  ownerColor?: string;
  dueDate?: string | null;
};

type AttendanceRow = {
  full_name: string | null;
  email: string | null;
  is_present: boolean;
  is_guest: boolean;
  color_hex?: string | null;
};

type MilestoneRow = {
  title: string;
  target_date: string | null;
  status: string;
  priority: string;
  owner_name: string;
  description: string | null;
  owner_color?: string | null;
};

type OngoingNoteRow = {
  title: string;
  content: string | null;
  category: string | null;
};

type MilestoneData = {
  title?: string;
  target_date?: string;
  status?: string;
  priority?: string;
  owner_name?: string;
  owner_id?: string;
  description?: string;
};

type OngoingNoteData = {
  title?: string;
  content?: string;
  category?: string;
};

type AttendanceData = {
  email?: string;
  full_name?: string;
  is_present?: boolean;
  is_guest?: boolean;
};

function hexToRgb(hex: string): RGB {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16) / 255;
  const g = parseInt(h.substring(2, 4), 16) / 255;
  const b = parseInt(h.substring(4, 6), 16) / 255;
  return rgb(r, g, b);
}

function getStatusBadgeColors(status: string): { bg: RGB; text: RGB } {
  const n = status.toLowerCase().trim();
  if (n === "in progress" || n === "in-progress" || n === "active")
    return { bg: rgb(0.859, 0.890, 0.996), text: rgb(0.118, 0.251, 0.686) };
  if (n === "waiting")
    return { bg: rgb(0.996, 0.953, 0.780), text: rgb(0.573, 0.251, 0.055) };
  if (n === "completed" || n === "complete" || n === "done")
    return { bg: rgb(0.863, 0.988, 0.906), text: rgb(0.086, 0.396, 0.204) };
  if (n === "delayed" || n === "overdue" || n === "blocked")
    return { bg: rgb(0.996, 0.886, 0.886), text: rgb(0.600, 0.106, 0.106) };
  if (n === "needs review")
    return { bg: rgb(0.996, 0.929, 0.835), text: rgb(0.573, 0.251, 0.055) };
  // Pending / default
  return { bg: rgb(0.945, 0.961, 0.976), text: rgb(0.392, 0.455, 0.545) };
}

function getPriorityBorderColor(priority: string): RGB {
  const n = priority.toLowerCase().trim();
  if (n === "urgent") return rgb(0.937, 0.267, 0.267);
  if (n === "high") return rgb(0.976, 0.451, 0.086);
  if (n === "normal") return rgb(0.231, 0.510, 0.965);
  return rgb(0.796, 0.835, 0.882); // Low / default
}

async function buildPdf(opts: {
  meetingTitle: string;
  meetingDateLabel: string;
  meetingTimeLabel: string;
  meetingLocation: string;
  agenda: AgendaPdfRow[];
  tasks: TaskRow[];
  referenceLink?: string | null;
  attendanceData: AttendanceRow[];
  milestones: MilestoneRow[];
  ongoingNotes: OngoingNoteRow[];
  sessionNumber?: number | null;
}) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const oblique = await pdf.embedFont(StandardFonts.HelveticaOblique);

  // Color palette
  const GREEN_50 = rgb(0.941, 0.992, 0.957);
  const GREEN_100 = rgb(0.863, 0.988, 0.906);
  const GREEN_200 = rgb(0.733, 0.969, 0.816);
  const GREEN_500 = rgb(0.133, 0.773, 0.369);
  const GREEN_600 = rgb(0.086, 0.639, 0.290);
  const GREEN_700 = rgb(0.082, 0.502, 0.239);
  const GREEN_800 = rgb(0.086, 0.396, 0.204);

  const SLATE_50 = rgb(0.973, 0.980, 0.988);
  const SLATE_100 = rgb(0.945, 0.961, 0.976);
  const SLATE_200 = rgb(0.886, 0.910, 0.941);
  const SLATE_300 = rgb(0.796, 0.835, 0.882);
  const SLATE_400 = rgb(0.580, 0.639, 0.722);
  const SLATE_500 = rgb(0.392, 0.455, 0.545);
  const SLATE_700 = rgb(0.200, 0.255, 0.333);
  const SLATE_800 = rgb(0.118, 0.161, 0.231);

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

  const drawText = (t: string, x: number, yPos: number, size: number, f: PDFFont, color: RGB) => {
    page.drawText(t, { x, y: yPos, size, font: f, color });
  };

  /** Draws a modern section divider: green dot + uppercase label + extending line */
  const drawSectionDivider = (label: string) => {
    ensureSpace(30);
    // Green dot
    page.drawCircle({ x: MARGIN_X + 4, y: y + 2, size: 3, color: GREEN_500 });
    // Label
    const labelW = bold.widthOfTextAtSize(label, 10);
    drawText(label, MARGIN_X + 14, y - 2, 10, bold, SLATE_700);
    // Extending line
    page.drawLine({
      start: { x: MARGIN_X + 18 + labelW, y: y + 1 },
      end: { x: PAGE_W - MARGIN_X, y: y + 1 },
      thickness: 1,
      color: SLATE_200,
    });
    y -= 16;
  };

  /** Draw a pill-shaped badge and return its width */
  const drawPillBadge = (text: string, x: number, yPos: number, bgColor: RGB, textColor: RGB, textFont: PDFFont, textSize: number, borderColor?: RGB) => {
    const tw = textFont.widthOfTextAtSize(text, textSize);
    const padX = 6;
    const padY = 2;
    const badgeW = tw + padX * 2;
    const badgeH = textSize + padY * 2 + 2;
    page.drawRectangle({
      x,
      y: yPos - padY - 1,
      width: badgeW,
      height: badgeH,
      color: bgColor,
      borderWidth: borderColor ? 1 : 0,
      borderColor: borderColor ?? bgColor,
    });
    drawText(text, x + padX, yPos + 1, textSize, textFont, textColor);
    return badgeW;
  };

  // ===== HEADER (centered) =====
  const titleSize = 22;
  ensureSpace(60);
  const titleW = bold.widthOfTextAtSize(opts.meetingTitle, titleSize);
  drawText(opts.meetingTitle, (PAGE_W - titleW) / 2, y, titleSize, bold, GREEN_800);
  y -= 22;

  // Date • Time • Location line
  const headerParts = [opts.meetingDateLabel, opts.meetingTimeLabel, opts.meetingLocation].filter(Boolean);
  const dateStr = headerParts.join("  \u2022  ");
  const dateW = font.widthOfTextAtSize(dateStr, 11);
  drawText(dateStr, (PAGE_W - dateW) / 2, y, 11, font, SLATE_500);
  y -= 18;

  // Session badge pill
  if (opts.sessionNumber) {
    const sessionText = `SESSION #${opts.sessionNumber}`;
    const stw = bold.widthOfTextAtSize(sessionText, 8);
    const pillW = stw + 14;
    const pillX = (PAGE_W - pillW) / 2;
    page.drawRectangle({
      x: pillX,
      y: y - 4,
      width: pillW,
      height: 16,
      color: GREEN_50,
      borderWidth: 1,
      borderColor: GREEN_200,
    });
    drawText(sessionText, pillX + 7, y, 8, bold, GREEN_700);
    y -= 22;
  }

  y -= 6;

  // ===== ATTENDANCE SECTION =====
  drawSectionDivider("ATTENDANCE");

  const present = opts.attendanceData.filter((a) => a.is_present && !a.is_guest);
  const absent = opts.attendanceData.filter((a) => !a.is_present && !a.is_guest);
  const guests = opts.attendanceData.filter((a) => a.is_guest);

  if (opts.attendanceData.length === 0) {
    ensureSpace(20);
    drawText("No attendance data recorded.", MARGIN_X + 10, y, 9, font, SLATE_400);
    y -= 20;
  } else {
    const drawChipRow = (label: string, items: AttendanceRow[], chipBg: RGB, chipBorder: RGB) => {
      if (items.length === 0) return;
      ensureSpace(28);
      drawText(label, MARGIN_X + 4, y, 8, bold, SLATE_400);
      y -= 14;

      let cx = MARGIN_X + 4;
      const chipH = 18;
      for (const att of items) {
        const name = (att.full_name ?? "").trim() || (att.email ?? "").trim() || "Unknown";
        const nameW = font.widthOfTextAtSize(name, 9);
        const chipW = nameW + 22;

        if (cx + chipW > PAGE_W - MARGIN_X) {
          y -= chipH + 4;
          cx = MARGIN_X + 4;
          ensureSpace(chipH + 4);
        }

        // Chip background
        page.drawRectangle({
          x: cx,
          y: y - 4,
          width: chipW,
          height: chipH,
          color: chipBg,
          borderWidth: 1,
          borderColor: chipBorder,
        });

        // Color dot
        const dotColor = att.color_hex ? hexToRgb(att.color_hex) : SLATE_400;
        page.drawCircle({ x: cx + 9, y: y + 5, size: 3, color: dotColor });

        // Name
        drawText(name, cx + 16, y + 1, 9, font, SLATE_700);
        cx += chipW + 6;
      }
      y -= chipH + 8;
    };

    drawChipRow("PRESENT", present, SLATE_50, SLATE_200);
    drawChipRow("ABSENT", absent, rgb(0.980, 0.960, 0.960), SLATE_200);
    drawChipRow("GUESTS", guests, rgb(0.940, 0.955, 0.996), SLATE_200);
  }

  y -= 6;

  // ===== MILESTONES SECTION =====
  drawSectionDivider("MILESTONES");

  // Sort milestones by target_date ascending
  const sortedMilestones = [...opts.milestones].sort((a, b) => {
    if (a.target_date && !b.target_date) return -1;
    if (!a.target_date && b.target_date) return 1;
    if (a.target_date && b.target_date) return a.target_date.localeCompare(b.target_date);
    return 0;
  });

  if (sortedMilestones.length === 0) {
    ensureSpace(20);
    drawText("No milestones defined.", MARGIN_X + 10, y, 9, font, SLATE_400);
    y -= 20;
  } else {
    const msLeftW = CONTENT_W * 0.65;
    const msRightW = CONTENT_W * 0.35;

    for (let mi = 0; mi < sortedMilestones.length; mi++) {
      const ms = sortedMilestones[mi]!;

      // Estimate row height
      const titleLines = wrapText({ text: ms.title, font: bold, size: 10, maxWidth: msLeftW - 20 });
      const descLines = ms.description
        ? wrapText({ text: ms.description, font: oblique, size: 9, maxWidth: msRightW - 12 }).slice(0, 2)
        : [];
      const rowH = Math.max(36, titleLines.length * 12 + 24);
      ensureSpace(rowH + 4);

      const rowTop = y;

      // Priority left border strip
      const borderColor = getPriorityBorderColor(ms.priority);
      page.drawRectangle({
        x: MARGIN_X,
        y: rowTop - rowH,
        width: 4,
        height: rowH,
        color: borderColor,
      });

      // Row borders
      if (mi === 0) {
        page.drawLine({ start: { x: MARGIN_X, y: rowTop }, end: { x: PAGE_W - MARGIN_X, y: rowTop }, thickness: 1, color: SLATE_200 });
      }
      page.drawLine({ start: { x: MARGIN_X, y: rowTop - rowH }, end: { x: PAGE_W - MARGIN_X, y: rowTop - rowH }, thickness: 1, color: SLATE_200 });
      page.drawLine({ start: { x: MARGIN_X, y: rowTop }, end: { x: MARGIN_X, y: rowTop - rowH }, thickness: 1, color: SLATE_200 });
      page.drawLine({ start: { x: PAGE_W - MARGIN_X, y: rowTop }, end: { x: PAGE_W - MARGIN_X, y: rowTop - rowH }, thickness: 1, color: SLATE_200 });

      // Left column: title + meta
      let ly = rowTop - 12;
      for (const tl of titleLines) {
        drawText(tl, MARGIN_X + 10, ly, 10, bold, SLATE_800);
        ly -= 12;
      }

      // Meta row: date + status pill + owner with dot
      const metaY = ly;
      let mx = MARGIN_X + 10;
      if (ms.target_date) {
        drawText(ms.target_date, mx, metaY, 8, font, SLATE_500);
        mx += font.widthOfTextAtSize(ms.target_date, 8) + 8;
      }

      // Status pill
      const statusColors = getStatusBadgeColors(ms.status);
      const statusW = drawPillBadge(ms.status, mx, metaY, statusColors.bg, statusColors.text, font, 7);
      mx += statusW + 8;

      // Owner with dot
      const ownerDotColor = ms.owner_color ? hexToRgb(ms.owner_color) : SLATE_400;
      page.drawCircle({ x: mx + 3, y: metaY + 3, size: 2.5, color: ownerDotColor });
      drawText(clampText(ms.owner_name, 20), mx + 9, metaY, 8, font, SLATE_500);

      // Right column: description/notes
      if (descLines.length > 0) {
        let ry = rowTop - 12;
        const rightX = MARGIN_X + msLeftW;
        for (const dl of descLines) {
          drawText(dl, rightX, ry, 9, oblique, SLATE_400);
          ry -= 11;
        }
      }

      y -= rowH;
    }
  }

  y -= 12;

  // ===== ACTIVE TASKS (2-column layout, grouped by category) =====
  drawSectionDivider("ACTIVE TASKS");

  const taskColGap = 14;
  const taskColW = (CONTENT_W - taskColGap) / 2;
  let leftY = y;
  let rightY = y;

  const group = new Map<string, TaskRow[]>();
  for (const t of opts.tasks) {
    const key = t.columnName || "Uncategorized";
    if (!group.has(key)) group.set(key, []);
    group.get(key)!.push(t);
  }
  const categories = Array.from(group.keys()).sort((a, b) => a.localeCompare(b));

  if (opts.tasks.length === 0) {
    ensureSpace(20);
    drawText("No active tasks.", MARGIN_X + 10, y, 9, font, SLATE_400);
    y -= 20;
    leftY = y;
    rightY = y;
  }

  const drawTaskCategory = (x: number, yTop: number, cat: string, items: TaskRow[]) => {
    // Header
    const headerH = 22;
    const countText = `${items.length}`;

    // Calculate body height
    let bodyH = 8;
    for (const it of items) {
      const tLines = wrapText({ text: it.title || "", font: bold, size: 10, maxWidth: taskColW - 18 });
      bodyH += tLines.length * 12;
      bodyH += 16; // badge row
      bodyH += 12; // owner line
      const note = (it.notes ?? "").trim();
      const comm = (it.latestComment ?? "").trim();
      if (note) bodyH += Math.min(2, wrapText({ text: note, font: oblique, size: 8, maxWidth: taskColW - 18 }).length) * 10;
      if (comm) bodyH += Math.min(2, wrapText({ text: comm, font: oblique, size: 8, maxWidth: taskColW - 18 }).length) * 10;
      bodyH += 8; // separator
    }

    const totalH = headerH + Math.max(28, bodyH);

    // Card border
    page.drawRectangle({
      x,
      y: yTop - totalH,
      width: taskColW,
      height: totalH,
      borderWidth: 1,
      borderColor: SLATE_200,
    });

    // Green header
    page.drawRectangle({
      x: x + 1,
      y: yTop - headerH,
      width: taskColW - 2,
      height: headerH - 1,
      color: GREEN_50,
    });
    drawText(cat, x + 8, yTop - 14, 10, bold, GREEN_800);
    // Item count pill
    const pillX2 = x + taskColW - font.widthOfTextAtSize(countText, 8) - 18;
    drawPillBadge(countText, pillX2, yTop - 14, GREEN_100, GREEN_700, font, 8);

    // Task items
    let cy = yTop - headerH - 10;
    for (let ti = 0; ti < items.length; ti++) {
      const it = items[ti]!;
      // Separator line between items
      if (ti > 0) {
        page.drawLine({
          start: { x: x + 6, y: cy + 6 },
          end: { x: x + taskColW - 6, y: cy + 6 },
          thickness: 0.5,
          color: SLATE_100,
        });
        cy -= 2;
      }

      // Title
      const tLines = wrapText({ text: it.title || "", font: bold, size: 10, maxWidth: taskColW - 18 });
      for (const tl of tLines) {
        drawText(tl, x + 10, cy, 10, bold, SLATE_800);
        cy -= 12;
      }

      // Badge row: status pill + due date pill
      if (it.status) {
        const sc = getStatusBadgeColors(it.status);
        const sw = drawPillBadge(it.status, x + 10, cy, sc.bg, sc.text, font, 7);
        if (it.dueDate) {
          drawPillBadge(it.dueDate, x + 10 + sw + 6, cy, SLATE_50, SLATE_500, font, 7, SLATE_200);
        }
      } else if (it.dueDate) {
        drawPillBadge(it.dueDate, x + 10, cy, SLATE_50, SLATE_500, font, 7, SLATE_200);
      }
      cy -= 14;

      // Owner with color dot
      const ownerName = it.ownerName ?? "Unassigned";
      const ownerDotC = it.ownerColor ? hexToRgb(it.ownerColor) : SLATE_400;
      page.drawCircle({ x: x + 14, y: cy + 3, size: 2.5, color: ownerDotC });
      drawText(clampText(ownerName, 30), x + 20, cy, 9, font, SLATE_500);
      cy -= 12;

      // Notes
      const note = (it.notes ?? "").trim();
      if (note) {
        const nLines = wrapText({ text: note, font: oblique, size: 8, maxWidth: taskColW - 18 }).slice(0, 2);
        for (const nl of nLines) {
          drawText(nl, x + 10, cy, 8, oblique, SLATE_400);
          cy -= 10;
        }
      }
      // Latest comment
      const comm = (it.latestComment ?? "").trim();
      if (comm) {
        const cLines = wrapText({ text: `Latest: ${comm}`, font: oblique, size: 8, maxWidth: taskColW - 18 }).slice(0, 2);
        for (const cl of cLines) {
          drawText(cl, x + 10, cy, 8, oblique, SLATE_400);
          cy -= 10;
        }
      }
      cy -= 4;
    }

    return totalH;
  };

  const commitTasksBlock = () => {
    y = Math.min(leftY, rightY) - 10;
  };

  for (const cat of categories) {
    const items = group.get(cat) ?? [];
    const rough = 22 + Math.min(300, 40 + items.length * 50);

    if (Math.min(leftY, rightY) - rough < BOTTOM) {
      newPage();
      drawSectionDivider("ACTIVE TASKS (CONT.)");
      leftY = y;
      rightY = y;
    }

    const useLeft = leftY >= rightY;

    if ((useLeft ? leftY : rightY) - 80 < BOTTOM) {
      newPage();
      drawSectionDivider("ACTIVE TASKS (CONT.)");
      leftY = y;
      rightY = y;
    }

    const drawX = leftY >= rightY ? MARGIN_X : MARGIN_X + taskColW + taskColGap;
    const drawY = leftY >= rightY ? leftY : rightY;
    const h = drawTaskCategory(drawX, drawY, cat, items);
    if (useLeft) leftY -= h + 10;
    else rightY -= h + 10;
  }

  if (categories.length > 0) {
    commitTasksBlock();
  }
  y -= 6;

  // ===== DISCUSSION NOTES (side-by-side) =====
  drawSectionDivider("DISCUSSION NOTES");

  const noteGap = 10;
  const colW = (CONTENT_W - noteGap) / 2;

  if (opts.agenda.length === 0) {
    ensureSpace(20);
    drawText("No agenda items.", MARGIN_X + 10, y, 9, font, SLATE_400);
    y -= 20;
  }

  const drawAgendaSection = (row: AgendaPdfRow) => {
    const headerH = 20;

    const leftLines = wrapText({
      text: normalizeNotes(row.notes) || "(No notes)",
      font,
      size: 10,
      maxWidth: colW - 16,
    });
    const rightLines = wrapText({
      text: normalizeNotes(row.prevNotes) || "(No previous notes)",
      font,
      size: 10,
      maxWidth: colW - 16,
    });

    const maxLines = Math.max(leftLines.length, rightLines.length);
    const lineH = 12;
    const boxBodyH = Math.max(50, Math.min(320, maxLines * lineH + 28));
    const needed = headerH + boxBodyH + 14;
    ensureSpace(needed);

    // Agenda item header: code badge + title
    const labelParts = row.label.split(" - ");
    const code = labelParts.length > 1 ? labelParts[0]!.trim() : "";
    const title = labelParts.length > 1 ? labelParts.slice(1).join(" - ").trim() : row.label;

    if (code) {
      const codeW = bold.widthOfTextAtSize(code, 8) + 10;
      page.drawRectangle({ x: MARGIN_X, y: y - 12, width: codeW, height: 14, color: GREEN_600 });
      drawText(code, MARGIN_X + 5, y - 8, 8, bold, rgb(1, 1, 1));
      drawText(title, MARGIN_X + codeW + 6, y - 8, 11, bold, SLATE_700);
    } else {
      drawText(title, MARGIN_X, y - 8, 11, bold, SLATE_700);
    }
    y -= headerH + 4;

    // Left + right boxes
    const leftX = MARGIN_X;
    const rightX = MARGIN_X + colW + noteGap;

    page.drawRectangle({ x: leftX, y: y - boxBodyH, width: colW, height: boxBodyH, color: SLATE_50, borderWidth: 1, borderColor: SLATE_200 });
    page.drawRectangle({ x: rightX, y: y - boxBodyH, width: colW, height: boxBodyH, color: SLATE_50, borderWidth: 1, borderColor: SLATE_200 });

    drawText("THIS SESSION", leftX + 8, y - 12, 8, bold, SLATE_400);
    drawText("PREVIOUS SESSION", rightX + 8, y - 12, 8, bold, SLATE_400);

    let ly = y - 28;
    for (const ln of leftLines) {
      if (ly < y - boxBodyH + 10) break;
      drawText(ln, leftX + 8, ly, 10, ln === "(No notes)" ? oblique : font, ln === "(No notes)" ? SLATE_400 : SLATE_700);
      ly -= lineH;
    }

    let ry = y - 28;
    for (const ln of rightLines) {
      if (ry < y - boxBodyH + 10) break;
      drawText(ln, rightX + 8, ry, 10, ln === "(No previous notes)" ? oblique : font, ln === "(No previous notes)" ? SLATE_400 : SLATE_700);
      ry -= lineH;
    }

    y -= boxBodyH + 10;
  };

  for (const a of opts.agenda) {
    drawAgendaSection(a);
  }

  y -= 6;

  // ===== ONGOING NOTES =====
  drawSectionDivider("ONGOING NOTES");

  if (opts.ongoingNotes.length === 0) {
    ensureSpace(20);
    drawText("No ongoing notes.", MARGIN_X + 10, y, 9, font, SLATE_400);
    y -= 20;
  } else {
    for (let ni = 0; ni < opts.ongoingNotes.length; ni++) {
      const note = opts.ongoingNotes[ni]!;
      const titleLines = wrapText({ text: note.title, font: bold, size: 11, maxWidth: CONTENT_W - 20 });
      const contentLines = note.content
        ? wrapText({ text: normalizeNotes(note.content), font, size: 10, maxWidth: CONTENT_W - 30 })
        : [];
      const categoryLine = note.category ?? "";

      const neededH = titleLines.length * 14 + contentLines.length * 12 + (categoryLine ? 14 : 0) + 24;
      ensureSpace(neededH);

      // Card: white fill, slate border
      page.drawRectangle({
        x: MARGIN_X,
        y: y - neededH,
        width: CONTENT_W,
        height: neededH,
        color: rgb(1, 1, 1),
        borderWidth: 1,
        borderColor: SLATE_200,
      });

      let ny = y - 10;

      for (const tl of titleLines) {
        drawText(tl, MARGIN_X + 10, ny, 11, bold, SLATE_800);
        ny -= 14;
      }

      if (categoryLine) {
        drawText(categoryLine, MARGIN_X + 10, ny, 8, font, GREEN_600);
        ny -= 14;
      }

      if (contentLines.length > 0) {
        for (const cl of contentLines) {
          drawText(cl, MARGIN_X + 16, ny, 10, font, SLATE_500);
          ny -= 12;
        }
      } else {
        drawText("(No content)", MARGIN_X + 16, ny, 10, oblique, SLATE_400);
        ny -= 12;
      }

      y -= neededH + 8;
    }
  }

  // ===== REFERENCE LINK =====
  if (opts.referenceLink) {
    ensureSpace(40);
    page.drawLine({
      start: { x: MARGIN_X, y },
      end: { x: PAGE_W - MARGIN_X, y },
      thickness: 1,
      color: SLATE_200,
    });
    y -= 16;
    drawText("Reference link:", MARGIN_X, y, 9, bold, SLATE_700);
    drawText(clampText(opts.referenceLink, 140), MARGIN_X + 92, y, 9, font, rgb(0.1, 0.3, 0.8));
    y -= 12;
  }

  // ===== PAGE NUMBERS + GREEN TOP BAR =====
  const allPages = pdf.getPages();
  const totalPages = allPages.length;
  for (let i = 0; i < totalPages; i++) {
    const pg = allPages[i]!;

    // Green top accent bar
    pg.drawRectangle({ x: 0, y: PAGE_H - 6, width: PAGE_W, height: 6, color: GREEN_500 });

    // Page number
    const pageNumText = `Page ${i + 1} of ${totalPages}`;
    const pageNumW = font.widthOfTextAtSize(pageNumText, 9);
    pg.drawText(pageNumText, {
      x: (PAGE_W - pageNumW) / 2,
      y: 28,
      size: 9,
      font,
      color: SLATE_400,
    });

    // Brand
    const brandText = `Generated by ${APP_NAME}`;
    const brandW = font.widthOfTextAtSize(brandText, 7);
    pg.drawText(brandText, {
      x: (PAGE_W - brandW) / 2,
      y: 18,
      size: 7,
      font,
      color: SLATE_300,
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
      .select("email,full_name,user_id,color_hex")
      .eq("meeting_id", meetingId)
      .order("created_at", { ascending: true });
    if (attendeesRes.error) throw attendeesRes.error;

    const emailToName = new Map<string, string>();
    const colorByEmail = new Map<string, string>();
    for (const a of attendeesRes.data ?? []) {
      const typedA = a as { email?: string; full_name?: string; color_hex?: string };
      const e = String(typedA.email ?? "").trim().toLowerCase();
      const n = String(typedA.full_name ?? "").trim();
      if (e) emailToName.set(e, n || e);
      if (e && typedA.color_hex) colorByEmail.set(e, typedA.color_hex);
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

    const profRes = await admin.from("profiles").select("id,full_name,email,color_hex");
    if (profRes.error) throw profRes.error;

    const colName = new Map((colsRes.data ?? []).map((c: { id: string; name: string }) => [String(c.id), String(c.name)]));
    const ownerById = new Map(
      (profRes.data ?? []).map((p: { id: string; full_name?: string; email?: string }) => [
        String(p.id),
        String(p.full_name?.trim() || p.email?.trim() || "Unassigned"),
      ])
    );
    const emailById = new Map((profRes.data ?? []).map((p: { id: string; email?: string }) => [String(p.id), String(p.email ?? "").trim()]));
    const colorById = new Map(
      (profRes.data ?? [])
        .filter((p: { id: string; color_hex?: string }) => p.color_hex)
        .map((p: { id: string; color_hex?: string }) => [String(p.id), String(p.color_hex)])
    );

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

      // Resolve owner color from profiles or attendees
      const ownerColor = (t.owner_id ? colorById.get(String(t.owner_id)) : undefined)
        ?? (ownerEmail ? colorByEmail.get(ownerEmail) : undefined)
        ?? undefined;

      const due = t.due_date ? " | Due: " + String(t.due_date) : "";

      const meta = `${col} | ${String(t.status ?? "")} | ${String(t.priority ?? "")} | ${ownerName}${due}`;

      return {
        title: String(t.title ?? ""),
        meta,
        notes: String(t.notes ?? "").trim() || null,
        latestComment: latestCommentByTask.get(String(t.id)) ?? null,
        columnName: col,
        status: String(t.status ?? ""),
        priority: String(t.priority ?? ""),
        ownerName,
        ownerColor: ownerColor ?? undefined,
        dueDate: t.due_date ? String(t.due_date) : null,
      };
    });

    const agenda: AgendaPdfRow[] = (agendaRes.data ?? []).map((a: { id: string; code?: string; title?: string }) => ({
      label: `${a.code ? a.code + " - " : ""}${String(a.title ?? "")}`,
      notes: String(notesMap[String(a.id)] ?? "").trim(),
      prevNotes: String(prevNotesMap[String(a.id)] ?? "").trim(),
    }));

    // Reference link and session number stored on the session
    const sessionRes = await admin
      .from("meeting_minutes_sessions")
      .select("reference_link,session_number")
      .eq("id", sessionId)
      .maybeSingle();
    const referenceLink = !sessionRes.error ? sessionRes.data?.reference_link ?? null : null;
    const sessionNumber = !sessionRes.error ? sessionRes.data?.session_number ?? null : null;

    // Fetch milestones
    const milestonesRes = await admin
      .from("meeting_milestones")
      .select("id,title,description,target_date,status,priority,owner_id,owner_email,owner_name,position")
      .eq("meeting_id", meetingId)
      .order("position", { ascending: true });

    const milestones = (milestonesRes.data ?? []).map((m: MilestoneData) => {
      const explicit = String(m.owner_name ?? "").trim();
      const fromProfile = m.owner_id ? String(ownerById.get(String(m.owner_id)) ?? "").trim() : "";
      const ownerColor = m.owner_id ? colorById.get(String(m.owner_id)) ?? null : null;
      return {
        title: String(m.title ?? ""),
        target_date: m.target_date ? String(m.target_date) : null,
        status: String(m.status ?? "Pending"),
        priority: String(m.priority ?? "Normal"),
        owner_name: explicit || fromProfile || "Unassigned",
        description: m.description ? String(m.description) : null,
        owner_color: ownerColor,
      };
    });

    // Fetch ongoing notes
    const ongoingNotesRes = await admin
      .from("meeting_ongoing_notes")
      .select("id,title,content,category,position")
      .eq("meeting_id", meetingId)
      .order("position", { ascending: true });

    const ongoingNotes = (ongoingNotesRes.data ?? []).map((n: OngoingNoteData) => ({
      title: String(n.title ?? ""),
      content: n.content ? String(n.content) : null,
      category: n.category ? String(n.category) : null,
    }));

    // Fetch session attendance
    const attendanceRes = await admin
      .from("meeting_session_attendees")
      .select("email,full_name,is_present,is_guest")
      .eq("session_id", sessionId);

    const attendanceData: AttendanceRow[] = (attendanceRes.data ?? []).map((a: AttendanceData) => ({
      full_name: a.full_name ? String(a.full_name) : null,
      email: a.email ? String(a.email) : null,
      is_present: Boolean(a.is_present),
      is_guest: Boolean(a.is_guest),
      color_hex: a.email ? colorByEmail.get(String(a.email).trim().toLowerCase()) ?? null : null,
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
      agenda,
      tasks,
      referenceLink,
      attendanceData,
      milestones,
      ongoingNotes,
      sessionNumber,
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
