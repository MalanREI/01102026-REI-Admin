import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
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
function wrapText(opts: { text: string; font: any; size: number; maxWidth: number }): string[] {
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

async function buildPdf(opts: {
  headerTitle: string;
  headerDateLabel: string;
  idLabel: string;
  nameLabel: string;
  dateLabel: string;
  timeLabel: string;
  attendeesLabel: string;
  idValue: string;
  nameValue: string;
  dateValue: string;
  timeValue: string;
  attendeesValue: string;
  agenda: AgendaPdfRow[];
  tasks: { title: string; meta: string }[];
  referenceLink?: string | null;
}) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const page = pdf.addPage([612, 792]); // US Letter portrait
  const { width, height } = page.getSize();

  const marginX = 46;
  let y = height - 50;

  const drawText = (t: string, x: number, yPos: number, size: number, isBold = false, color?: any) => {
    const f = isBold ? bold : font;
    page.drawText(t, { x, y: yPos, size, font: f, color: color ?? rgb(0, 0, 0) });
  };

  const drawHr = (yPos: number) => {
    page.drawLine({
      start: { x: marginX, y: yPos },
      end: { x: width - marginX, y: yPos },
      thickness: 1,
      color: rgb(0.8, 0.8, 0.8),
    });
  };

  // Header
  drawText(opts.headerTitle, marginX, y, 16, true, rgb(0.2, 0.5, 0.2));
  const dateX = marginX + bold.widthOfTextAtSize(opts.headerTitle, 16) + 8;
  drawText(`- ${opts.headerDateLabel}`, dateX, y + 1, 11, false, rgb(0, 0, 0));
  y -= 18;
  drawHr(y);
  y -= 18;

  // Info table
  const tableX = marginX;
  const tableW = width - marginX * 2;
  const rowH = 22;
  const labelW = 110;

  const rows: Array<[string, string]> = [
    [opts.idLabel, opts.idValue],
    [opts.nameLabel, opts.nameValue],
    [opts.dateLabel, opts.dateValue],
    [opts.timeLabel, opts.timeValue],
    [opts.attendeesLabel, opts.attendeesValue],
  ];

  const tableH = rows.length * rowH;
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
    if (i > 0) drawHr(ry + rowH);

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

  y -= tableH + 24;

  // Tasks
  drawText("ACTIVE TASKS", marginX, y, 12, true, rgb(0.2, 0.5, 0.2));
  y -= 14;

  if (opts.tasks.length === 0) {
    drawText("(none)", marginX, y, 10, false, rgb(0.3, 0.3, 0.3));
    y -= 14;
  } else {
    for (const t of opts.tasks) {
      const titleLines = wrapText({ text: t.title, font: bold, size: 10, maxWidth: tableW - 16 });
      const metaLines = wrapText({ text: t.meta, font, size: 9, maxWidth: tableW - 16 });

      const blockH = (titleLines.length + metaLines.length) * 12 + 10;
      if (y - blockH < 60) break;

      page.drawRectangle({
        x: marginX,
        y: y - blockH,
        width: tableW,
        height: blockH,
        borderWidth: 1,
        borderColor: rgb(0.85, 0.85, 0.85),
        color: rgb(0.98, 0.98, 0.98),
      });

      let ty = y - 16;
      for (const ln of titleLines) {
        drawText(ln, marginX + 8, ty, 10, true);
        ty -= 12;
      }
      for (const ln of metaLines) {
        drawText(ln, marginX + 8, ty, 9, false, rgb(0.25, 0.25, 0.25));
        ty -= 12;
      }
      y -= blockH + 10;
    }
  }

  y -= 8;

  // Agenda notes
  drawText("DISCUSSION NOTES", marginX, y, 12, true, rgb(0.2, 0.5, 0.2));
  y -= 16;

  const colGap = 10;
  const colW = (tableW - colGap) / 2;
  const headerH = 20;

  for (const a of opts.agenda) {
    const sectionTitle = a.label;
    const blockTopY = y;

    page.drawRectangle({
      x: marginX,
      y: blockTopY - headerH,
      width: tableW,
      height: headerH,
      borderWidth: 1,
      borderColor: rgb(0.85, 0.85, 0.85),
      color: rgb(0.95, 0.98, 0.95),
    });
    drawText(sectionTitle, marginX + 10, blockTopY - 14, 10, true);
    y -= headerH + 8;

    const leftTitle = "Meeting minutes (current)";
    const rightTitle = "Previous meeting minutes";
    const boxH = 88;

    // left box
    page.drawRectangle({
      x: marginX,
      y: y - boxH,
      width: colW,
      height: boxH,
      borderWidth: 1,
      borderColor: rgb(0.9, 0.9, 0.9),
      color: rgb(1, 1, 1),
    });
    drawText(leftTitle, marginX + 8, y - 14, 8, true, rgb(0.25, 0.25, 0.25));
    const leftLines = wrapText({
      text: normalizeNotes(a.notes) || "(No notes)",
      font,
      size: 8,
      maxWidth: colW - 16,
    });
    let ly = y - 28;
    for (const ln of leftLines.slice(0, 6)) {
      drawText(ln, marginX + 8, ly, 8, false, rgb(0.1, 0.1, 0.1));
      ly -= 10;
    }

    // right box
    const rx = marginX + colW + colGap;
    page.drawRectangle({
      x: rx,
      y: y - boxH,
      width: colW,
      height: boxH,
      borderWidth: 1,
      borderColor: rgb(0.9, 0.9, 0.9),
      color: rgb(1, 1, 1),
    });
    drawText(rightTitle, rx + 8, y - 14, 8, true, rgb(0.25, 0.25, 0.25));
    const rightLines = wrapText({
      text: normalizeNotes(a.prevNotes) || "(No previous notes)",
      font,
      size: 8,
      maxWidth: colW - 16,
    });
    let ry = y - 28;
    for (const ln of rightLines.slice(0, 6)) {
      drawText(ln, rx + 8, ry, 8, false, rgb(0.1, 0.1, 0.1));
      ry -= 10;
    }

    y -= boxH + 14;
    if (y < 70) break; // keep safe (no paging)
  }

  if (opts.referenceLink) {
    drawHr(56);
    drawText("Reference link:", marginX, 40, 9, true, rgb(0.2, 0.2, 0.2));
    drawText(clampText(opts.referenceLink, 140), marginX + 92, 40, 9, false, rgb(0.1, 0.3, 0.8));
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

    // Fetch meeting + attendees
    const meetingRes = await admin
      .from("meetings")
      .select("id,title,location,start_at")
      .eq("id", meetingId)
      .single();
    if (meetingRes.error) throw meetingRes.error;

    const attendeesRes = await admin
      .from("meeting_attendees")
      .select("email,user_id")
      .eq("meeting_id", meetingId)
      .order("created_at", { ascending: true });
    if (attendeesRes.error) throw attendeesRes.error;

    const attendees = (attendeesRes.data ?? [])
      .map((a: any) => String(a.email ?? "").trim())
      .filter(Boolean);

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
      notesMap[String((r as any).agenda_item_id)] = String((r as any).notes ?? "");
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
        prevNotesMap[String((r as any).agenda_item_id)] = String((r as any).notes ?? "");
      }
    }

    // OPEN tasks only
    const tasksRes = await admin
      .from("meeting_tasks")
      .select("title,status,priority,owner_id,due_date,column_id")
      .eq("meeting_id", meetingId)
      .neq("status", "Completed");
    if (tasksRes.error) throw tasksRes.error;

    const colsRes = await admin.from("meeting_task_columns").select("id,name").eq("meeting_id", meetingId);
    if (colsRes.error) throw colsRes.error;

    const profRes = await admin.from("profiles").select("id,full_name,email");
    if (profRes.error) throw profRes.error;

    const colName = new Map((colsRes.data ?? []).map((c: any) => [String(c.id), String(c.name)]));
    const ownerName = new Map(
      (profRes.data ?? []).map((p: any) => [String(p.id), String(p.full_name?.trim() || p.email || "Unassigned")])
    );

    const tasks = (tasksRes.data ?? []).map((t: any) => ({
      title: String(t.title ?? ""),
      meta: `${colName.get(String(t.column_id)) ?? ""} | ${String(t.status ?? "")} | ${String(t.priority ?? "")} | ${
        t.owner_id ? ownerName.get(String(t.owner_id)) ?? "Unassigned" : "Unassigned"
      }${t.due_date ? " | Due: " + String(t.due_date) : ""}`,
    }));

    const agenda: AgendaPdfRow[] = (agendaRes.data ?? []).map((a: any) => ({
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
    const referenceLink = !sessionRes.error ? (sessionRes.data as any)?.reference_link ?? null : null;

    // Build PDF
    const meeting = meetingRes.data as any;
    const start = new Date(meeting.start_at);
    const dateLabel = start.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
    const timeLabel = `${start.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;

    const pdfBytes = await buildPdf({
      headerTitle: "OPERATIONS WEEKLY MEETING",
      headerDateLabel: dateLabel,
      idLabel: "ID",
      nameLabel: "NAME",
      dateLabel: "DATE",
      timeLabel: "TIME",
      attendeesLabel: "ATTENDEES",
      idValue: sessionId,
      nameValue: meeting.title,
      dateValue: dateLabel,
      timeValue: timeLabel,
      attendeesValue: attendees.join(", "),
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
    const updSession = await admin
      .from("meeting_minutes_sessions")
      .update({ pdf_path: pdfPath } as any)
      .eq("id", sessionId);
    if (updSession.error) throw updSession.error;

    // Signed URL (optional)
    let pdfUrl: string | null = null;
    try {
      const signed = await admin.storage.from(pdfBucket).createSignedUrl(pdfPath, 60 * 60 * 24 * 30);
      if (!signed.error) pdfUrl = signed.data?.signedUrl ?? null;
    } catch {
      // ignore
    }

    // Email w/ attachment
    if (attendees.length > 0) {
      const transporter = nodemailer.createTransport({
        host: requireEnv("SMTP_HOST"),
        port: Number(requireEnv("SMTP_PORT")),
        secure: Number(requireEnv("SMTP_PORT")) === 465,
        auth: { user: requireEnv("SMTP_USER"), pass: requireEnv("SMTP_PASS") },
      });

      const subject = `Minutes PDF: ${meeting.title} (${start.toLocaleDateString()})`;
      const bodyText =
        "Meeting minutes PDF attached.\n\n" +
        (referenceLink ? `Reference link: ${referenceLink}\n\n` : "") +
        (pdfUrl ? `PDF link (signed): ${pdfUrl}\n\n` : "");

      await transporter.sendMail({
        from: requireEnv("SMTP_FROM"),
        to: attendees.join(","),
        subject,
        text: bodyText,
        attachments: [
          {
            filename: `Minutes - ${meeting.title}.pdf`,
            content: Buffer.from(pdfBytes),
            contentType: "application/pdf",
          },
        ],
      });
    }

    return NextResponse.json({ ok: true, pdfPath, pdfUrl });
  } catch (e: any) {
    const status = String(e?.message || "").toLowerCase().includes("unauthorized") ? 401 : 500;
    return NextResponse.json({ error: e?.message ?? "Finalize failed" }, { status });
  }
}
