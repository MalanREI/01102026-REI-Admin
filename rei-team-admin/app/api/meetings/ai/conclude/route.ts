import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import OpenAI from "openai";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { supabaseAdmin } from "@/src/lib/supabase/admin";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

/**
 * Convert ArrayBuffer to File (Node 20+ supports global File).
 */
// eslint-disable-next-line no-undef
function bufToFile(buf: ArrayBuffer, filename: string, mime: string) {
  // eslint-disable-next-line no-undef
  return new File([buf], filename, { type: mime });
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
function wrapText(opts: {
  text: string;
  font: any;
  size: number;
  maxWidth: number;
}): string[] {
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
  docTitle: string;
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

  // Border
  const tableH = rows.length * rowH;
  page.drawRectangle({ x: tableX, y: y - tableH, width: tableW, height: tableH, borderWidth: 1, borderColor: rgb(0.75, 0.75, 0.75) });

  for (let i = 0; i < rows.length; i++) {
    const ry = y - rowH * (i + 1);
    // row line
    if (i > 0) drawHr(ry + rowH);

    // label background
    page.drawRectangle({ x: tableX, y: ry, width: labelW, height: rowH, color: rgb(0.95, 0.95, 0.95) });

    // vertical divider
    page.drawLine({ start: { x: tableX + labelW, y: ry }, end: { x: tableX + labelW, y: ry + rowH }, thickness: 1, color: rgb(0.75, 0.75, 0.75) });

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
      if (y - blockH < 60) break; // no paging for now; keep safe

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

  // Agenda notes section
  drawText("DISCUSSION NOTES", marginX, y, 12, true, rgb(0.2, 0.5, 0.2));
  y -= 16;

  const colGap = 10;
  const colW = (tableW - colGap) / 2;
  const headerH = 20;

  for (const a of opts.agenda) {
    const sectionTitle = a.label;
    const blockTopY = y;

    // Section header box
    page.drawRectangle({
      x: marginX,
      y: blockTopY - headerH,
      width: tableW,
      height: headerH,
      borderWidth: 1,
      borderColor: rgb(0.75, 0.75, 0.75),
      color: rgb(1, 1, 1),
    });
    // Center title
    const titleSize = 12;
    const titleW = bold.widthOfTextAtSize(sectionTitle, titleSize);
    drawText(sectionTitle, marginX + (tableW - titleW) / 2, blockTopY - 15, titleSize, true);

    // Content box
    const contentYTop = blockTopY - headerH;
    const contentPad = 8;

    const leftX = marginX;
    const rightX = marginX + colW + colGap;

    const leftHeader = "Meeting Notes";
    const rightHeader = "Previous Notes";

    const leftLines = wrapText({ text: normalizeNotes(a.notes) || "(none)", font, size: 10, maxWidth: colW - contentPad * 2 });
    const rightLines = wrapText({ text: normalizeNotes(a.prevNotes) || "(none)", font, size: 10, maxWidth: colW - contentPad * 2 });

    const maxLines = Math.max(leftLines.length, rightLines.length);
    const contentH = Math.max(70, contentPad * 2 + 16 + maxLines * 12);

    if (y - (headerH + contentH) < 70) break; // no paging (keep safe)

    // outer
    page.drawRectangle({
      x: marginX,
      y: contentYTop - contentH,
      width: tableW,
      height: contentH,
      borderWidth: 1,
      borderColor: rgb(0.75, 0.75, 0.75),
      color: rgb(1, 1, 1),
    });

    // vertical divider
    page.drawLine({
      start: { x: marginX + colW + colGap / 2, y: contentYTop },
      end: { x: marginX + colW + colGap / 2, y: contentYTop - contentH },
      thickness: 1,
      color: rgb(0.85, 0.85, 0.85),
    });

    // column headers
    drawText(leftHeader, leftX + contentPad, contentYTop - 14, 10, true);
    drawText(rightHeader, rightX + contentPad, contentYTop - 14, 10, true);

    let ly = contentYTop - 30;
    for (const ln of leftLines) {
      drawText(ln, leftX + contentPad, ly, 10, false);
      ly -= 12;
    }
    let ry = contentYTop - 30;
    for (const ln of rightLines) {
      drawText(ln, rightX + contentPad, ry, 10, false);
      ry -= 12;
    }

    y = contentYTop - contentH - 14;
  }

  // Reference link
  if (opts.referenceLink) {
    drawHr(56);
    drawText("Reference link:", marginX, 40, 9, true, rgb(0.2, 0.2, 0.2));
    drawText(clampText(opts.referenceLink, 140), marginX + 92, 40, 9, false, rgb(0.1, 0.3, 0.8));
  }

  return pdf.save();
}

async function runAiAndUpdateNotes(opts: {
  meetingId: string;
  sessionId: string;
  recordingPath: string;
}) {
  const admin = supabaseAdmin();
  const openaiKey = requireEnv("OPENAI_API_KEY");
  const recordingsBucket = requireEnv("RECORDINGS_BUCKET");

  // 1) agenda items
  const agendaRes = await admin
    .from("meeting_agenda_items")
    .select("id,code,title,description,position")
    .eq("meeting_id", opts.meetingId)
    .order("position", { ascending: true });

  if (agendaRes.error) throw agendaRes.error;

  const agenda = agendaRes.data ?? [];

  // 2) download recording
  const dl = await admin.storage.from(recordingsBucket).download(opts.recordingPath);
  if (dl.error) throw dl.error;

  const arrBuf = await dl.data.arrayBuffer();

  // 3) transcribe
  const client = new OpenAI({ apiKey: openaiKey });
  const transcription = await client.audio.transcriptions.create({
    model: process.env.OPENAI_TRANSCRIBE_MODEL || "gpt-4o-mini-transcribe",
    file: bufToFile(arrBuf, "recording.webm", "audio/webm"),
  });

  const transcriptText = (transcription as any)?.text ? String((transcription as any).text) : "";

  // 4) summarize into agenda mapping
  const schema = {
    name: "AgendaNotes",
    schema: { type: "object", additionalProperties: { type: "string" } },
    strict: true,
  } as const;

  const agendaList = agenda
    .map(
      (a: any) =>
        `${a.id} | ${a.code ? a.code + " - " : ""}${a.title}${a.description ? " — " + a.description : ""}`
    )
    .join("\n");

  const completion = await client.chat.completions.create({
    model: process.env.OPENAI_SUMMARY_MODEL || "gpt-4o-mini",
    temperature: 0.2,
    response_format: { type: "json_schema", json_schema: schema },
    messages: [
      {
        role: "system",
        content:
          "Turn a meeting transcript into concise, professional meeting minutes. " +
          "Return ONLY JSON mapping agenda_item_id -> notes. Keep notes factual and action-oriented. " +
          "If an agenda item was not discussed, return an empty string for that item.",
      },
      {
        role: "user",
        content: `Agenda items (id | label):\n${agendaList}\n\nTranscript:\n${transcriptText}`,
      },
    ],
  });

  const content = completion.choices?.[0]?.message?.content ?? "{}";

  let notesObj: Record<string, string> = {};
  try {
    notesObj = JSON.parse(content);
  } catch {
    notesObj = {};
  }

  // 5) upsert notes rows
  const upRows = agenda.map((a: any) => ({
    session_id: opts.sessionId,
    agenda_item_id: a.id,
    notes: String(notesObj[String(a.id)] ?? ""),
    updated_at: new Date().toISOString(),
  }));

  const up = await admin.from("meeting_agenda_notes").upsert(upRows, { onConflict: "session_id,agenda_item_id" });
  if (up.error) throw up.error;

  // 6) store transcript on session (best-effort)
  try {
    await admin.from("meeting_minutes_sessions").update({ transcript: transcriptText } as any).eq("id", opts.sessionId);
  } catch {
    // no-op
  }

  return { transcriptText, agendaItemsUpdated: upRows.length };
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      meetingId?: string;
      sessionId?: string;
      recordingPath?: string | null;
      referenceLink?: string | null;
    };

    const meetingId = String(body.meetingId ?? "");
    const sessionId = String(body.sessionId ?? "");
    const referenceLink = body.referenceLink ?? null;

    if (!meetingId || !sessionId) {
      return NextResponse.json({ error: "meetingId + sessionId required" }, { status: 400 });
    }

    const admin = supabaseAdmin();

    // If recordingPath not provided, try to locate latest recording for this session.
    let recordingPath = (body.recordingPath ?? "").trim();
    if (!recordingPath) {
      const rec = await admin
        .from("meeting_recordings")
        .select("storage_path,created_at")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!rec.error && rec.data?.storage_path) recordingPath = String(rec.data.storage_path);
    }

    // Run AI first (if we have a recording)
    if (recordingPath) {
      await runAiAndUpdateNotes({ meetingId, sessionId, recordingPath });
    }

    // Fetch meeting + attendees
    const meetingRes = await admin
      .from("meetings")
      .select("id,title,location,start_at")
      .eq("id", meetingId)
      .single();
    if (meetingRes.error) throw meetingRes.error;

    const attendeesRes = await admin
      .from("meeting_attendees")
      .select("email,full_name")
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

    // Previous session notes (latest ended session excluding current)
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

    // OPEN tasks only (no Completed)
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

    // Build PDF
    const meeting = meetingRes.data as any;
    const start = new Date(meeting.start_at);
    const dateLabel = start.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
    const timeLabel = `${start.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;

    const pdfBytes = await buildPdf({
      docTitle: meeting.title,
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

    // Upload PDF to Storage
    const pdfBucket = requireEnv("MINUTES_PDF_BUCKET");
    const pdfPath = `meetings/${meetingId}/sessions/${sessionId}/minutes.pdf`;

    const upPdf = await admin.storage.from(pdfBucket).upload(pdfPath, pdfBytes, {
      contentType: "application/pdf",
      upsert: true,
    });

    if (upPdf.error) throw upPdf.error;

    // Save PDF path + end the session
    const updSession = await admin
      .from("meeting_minutes_sessions")
      .update({ pdf_path: pdfPath, ended_at: new Date().toISOString() } as any)
      .eq("id", sessionId)
      .select("id")
      .single();

    if (updSession.error) throw updSession.error;

    // Signed URL (optional)
    let pdfUrl: string | null = null;
    try {
      const signed = await admin.storage.from(pdfBucket).createSignedUrl(pdfPath, 60 * 60 * 24 * 30);
      if (!signed.error) pdfUrl = signed.data?.signedUrl ?? null;
    } catch {
      // ignore
    }

    // Send email w/ attachment
    const host = requireEnv("SMTP_HOST");
    const port = Number(requireEnv("SMTP_PORT"));
    const user = requireEnv("SMTP_USER");
    const pass = requireEnv("SMTP_PASS");
    const from = requireEnv("SMTP_FROM");

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });

    if (attendees.length > 0) {
      const subject = `Minutes PDF: ${meeting.title} (${start.toLocaleDateString()})`;
      const bodyText =
        "Meeting minutes PDF attached.\n\n" +
        (referenceLink ? `Reference link: ${referenceLink}\n\n` : "") +
        (pdfUrl ? `PDF link (signed): ${pdfUrl}\n\n` : "");

      await transporter.sendMail({
        from,
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

    return NextResponse.json({ ok: true, pdfPath, pdfUrl, recordingPath: recordingPath || null });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Conclude failed" }, { status: 500 });
  }
}
