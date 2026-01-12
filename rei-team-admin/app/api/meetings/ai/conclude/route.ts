import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { supabaseAdmin } from "@/src/lib/supabase/admin";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

async function buildPdf(opts: {
  title: string;
  when: string;
  location: string | null;
  attendees: string[];
  tasks: Array<{ title: string; status: string; priority: string; owner: string; due: string | null; column: string }>;
  agenda: Array<{ label: string; notes: string; prevNotes: string }>;
}) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const page = pdf.addPage();
  const { width, height } = page.getSize();

  const margin = 40;
  let y = height - margin;

  const line = (text: string, isBold = false, size = 11) => {
    const f = isBold ? bold : font;
    page.drawText(text, { x: margin, y, size, font: f });
    y -= size + 6;
  };

  line("REI — MEETING MINUTES", true, 16);
  line(`Meeting: ${opts.title}`, true, 12);
  line(`When: ${opts.when}`);
  if (opts.location) line(`Location: ${opts.location}`);
  line(`Attendees: ${opts.attendees.join(", ") || "(none)"}`);
  y -= 8;

  line("OPEN TASKS", true, 13);
  if (!opts.tasks.length) line("(No open tasks)");
  for (const t of opts.tasks) {
    line(`• ${t.title}`, true, 11);
    line(`  ${t.column} | ${t.status} | ${t.priority} | ${t.owner}${t.due ? " | Due: " + t.due : ""}`, false, 10);
    y -= 2;
  }

  y -= 8;
  line("AGENDA NOTES", true, 13);
  for (const a of opts.agenda) {
    line(a.label, true, 11);
    line(`Current: ${a.notes || "(none)"}`, false, 10);
    line(`Previous: ${a.prevNotes || "(none)"}`, false, 10);
    y -= 4;
  }

  return pdf.save();
}

export async function POST(req: Request) {
  try {
    const { meetingId, sessionId } = (await req.json()) as { meetingId?: string; sessionId?: string };
    if (!meetingId || !sessionId) {
      return NextResponse.json({ error: "meetingId + sessionId required" }, { status: 400 });
    }

    const admin = supabaseAdmin();

    // End session
    const ended = await admin
      .from("meeting_minutes_sessions")
      .update({ ended_at: new Date().toISOString() })
      .eq("id", sessionId)
      .select("id,meeting_id,started_at,ended_at")
      .single();
    if (ended.error) throw ended.error;

    const meetingRes = await admin
      .from("meetings")
      .select("id,title,location,start_at,duration_minutes")
      .eq("id", meetingId)
      .single();
    if (meetingRes.error) throw meetingRes.error;

    const attendeesRes = await admin.from("meeting_attendees").select("email").eq("meeting_id", meetingId);
    if (attendeesRes.error) throw attendeesRes.error;
    const attendees = (attendeesRes.data ?? []).map((x: any) => String(x.email).trim()).filter(Boolean);

    const agendaRes = await admin
      .from("meeting_agenda_items")
      .select("id,code,title,position")
      .eq("meeting_id", meetingId)
      .order("position", { ascending: true });
    if (agendaRes.error) throw agendaRes.error;

    const notesRes = await admin
      .from("meeting_agenda_notes")
      .select("agenda_item_id,notes")
      .eq("session_id", sessionId);
    if (notesRes.error) throw notesRes.error;

    // Previous session notes (latest session before current)
    const prevSessionRes = await admin
      .from("meeting_minutes_sessions")
      .select("id,started_at")
      .eq("meeting_id", meetingId)
      .lt("started_at", ended.data.started_at)
      .order("started_at", { ascending: false })
      .limit(1);

    const prevSessionId = (prevSessionRes.data ?? [])[0]?.id ?? null;

    let prevNotesMap: Record<string, string> = {};
    if (prevSessionId) {
      const pn = await admin.from("meeting_agenda_notes").select("agenda_item_id,notes").eq("session_id", prevSessionId);
      if (!pn.error) {
        for (const r of pn.data ?? []) prevNotesMap[String((r as any).agenda_item_id)] = String((r as any).notes ?? "");
      }
    }

    const notesMap: Record<string, string> = {};
    for (const r of notesRes.data ?? []) notesMap[String((r as any).agenda_item_id)] = String((r as any).notes ?? "");

    // OPEN tasks only
    const tasksRes = await admin
      .from("meeting_tasks")
      .select("title,status,priority,owner_id,due_date,column_id")
      .eq("meeting_id", meetingId)
      .neq("status", "Completed");

    const colsRes = await admin.from("meeting_task_columns").select("id,name").eq("meeting_id", meetingId);
    const profRes = await admin.from("profiles").select("id,full_name,email");

    const colName = new Map((colsRes.data ?? []).map((c: any) => [String(c.id), String(c.name)]));
    const ownerName = new Map(
      (profRes.data ?? []).map((p: any) => [
        String(p.id),
        String(p.full_name?.trim() || p.email?.trim() || "Unassigned"),
      ])
    );

    const tasks = (tasksRes.data ?? []).map((t: any) => ({
      title: String(t.title ?? ""),
      status: String(t.status ?? ""),
      priority: String(t.priority ?? ""),
      owner: t.owner_id ? ownerName.get(String(t.owner_id)) ?? "Unassigned" : "Unassigned",
      due: t.due_date ? String(t.due_date) : null,
      column: colName.get(String(t.column_id)) ?? "",
    }));

    const agenda = (agendaRes.data ?? []).map((a: any) => ({
      label: `${a.code ? a.code + " - " : ""}${String(a.title ?? "")}`,
      notes: String(notesMap[String(a.id)] ?? "").trim(),
      prevNotes: String(prevNotesMap[String(a.id)] ?? "").trim(),
    }));

    const pdfBytes = await buildPdf({
      title: meetingRes.data.title,
      when: new Date(meetingRes.data.start_at).toLocaleString(),
      location: meetingRes.data.location,
      attendees,
      tasks,
      agenda,
    });

    const pdfBucket = requireEnv("MINUTES_PDF_BUCKET");
    const pdfPath = `meetings/${meetingId}/sessions/${sessionId}/minutes.pdf`;

    const upPdf = await admin.storage.from(pdfBucket).upload(pdfPath, pdfBytes, {
      contentType: "application/pdf",
      upsert: true,
    });
    if (upPdf.error) throw upPdf.error;

    // store path for “View Previous Meetings”
    await admin.from("meeting_minutes_sessions").update({ pdf_path: pdfPath } as any).eq("id", sessionId);

    // email pdf
    if (attendees.length) {
      const transporter = nodemailer.createTransport({
        host: requireEnv("SMTP_HOST"),
        port: Number(requireEnv("SMTP_PORT")),
        secure: Number(requireEnv("SMTP_PORT")) === 465,
        auth: { user: requireEnv("SMTP_USER"), pass: requireEnv("SMTP_PASS") },
      });

      await transporter.sendMail({
        from: requireEnv("SMTP_FROM"),
        to: attendees.join(","),
        subject: `Minutes PDF: ${meetingRes.data.title} (${new Date(meetingRes.data.start_at).toLocaleDateString()})`,
        text: "Meeting minutes PDF attached.",
        attachments: [
          { filename: `Minutes - ${meetingRes.data.title}.pdf`, content: Buffer.from(pdfBytes), contentType: "application/pdf" },
        ],
      });
    }

    return NextResponse.json({ ok: true, pdfPath });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Conclude failed" }, { status: 500 });
  }
}
