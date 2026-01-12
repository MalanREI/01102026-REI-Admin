import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { supabaseAdmin } from "@/src/lib/supabase/admin";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

function escapeHtml(s: string) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function makeMinutesPdf(opts: {
  meeting: { title: string; location: string | null; start_at: string; duration_minutes: number };
  attendees: string[];
  agenda: Array<{ code: string | null; title: string; description: string | null; notes: string; prevNotes: string }>;
  tasks: Array<{ title: string; column: string; status: string; priority: string; owner: string; due: string | null }>;
}) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const margin = 48;
  const lineH = 14;
  let page = pdf.addPage();
  let { width, height } = page.getSize();
  let y = height - margin;

  const wrapText = (text: string, f: any, size: number, maxWidth: number) => {
    const words = String(text).replace(/\r/g, "").split(/\s+/g).filter(Boolean);
    const out: string[] = [];
    let cur = "";
    for (const w of words) {
      const next = cur ? cur + " " + w : w;
      const wWidth = f.widthOfTextAtSize(next, size);
      if (wWidth <= maxWidth) cur = next;
      else {
        if (cur) out.push(cur);
        cur = w;
      }
    }
    if (cur) out.push(cur);
    return out.length ? out : [""];
  };

  const writeLine = (text: string, bold = false, size = 11) => {
    const f = bold ? fontBold : font;
    const lines = wrapText(text, f, size, width - margin * 2);
    for (const ln of lines) {
      if (y < margin + lineH * 2) {
        page = pdf.addPage();
        ({ width, height } = page.getSize());
        y = height - margin;
      }
      page.drawText(ln, { x: margin, y, size, font: f });
      y -= lineH;
    }
  };

  writeLine("RENEWABLE ENERGY INCENTIVES", true, 12);
  writeLine("MEETING MINUTES", true, 18);
  writeLine(`Meeting: ${opts.meeting.title}`, true, 12);
  writeLine(`When: ${new Date(opts.meeting.start_at).toLocaleString()}`);
  writeLine(`Duration: ${opts.meeting.duration_minutes} minutes`);
  if (opts.meeting.location) writeLine(`Location: ${opts.meeting.location}`);
  if (opts.attendees.length) writeLine(`Attendees: ${opts.attendees.join(", ")}`);
  y -= 10;

  writeLine("OPEN TASKS", true, 14);
  if (!opts.tasks.length) {
    writeLine("(No open tasks)");
  } else {
    for (const t of opts.tasks) {
      writeLine(`${t.column} • ${t.status} • ${t.priority} • ${t.owner}${t.due ? " • Due " + t.due : ""}`, false, 10);
      writeLine(`- ${t.title}`, true, 11);
      y -= 4;
    }
  }
  y -= 10;

  writeLine("AGENDA + MINUTES", true, 14);
  for (const a of opts.agenda) {
    writeLine(`${a.code ? a.code + " - " : ""}${a.title}`, true, 12);
    if (a.description) writeLine(a.description, false, 10);
    writeLine("Current meeting notes:", true, 10);
    writeLine(a.notes || "(No notes)", false, 10);
    writeLine("Previous meeting notes:", true, 10);
    writeLine(a.prevNotes || "(No previous notes)", false, 10);
    y -= 8;
  }

  return pdf.save();
}

export async function POST(req: Request) {
  try {
    const { meetingId, sessionId } = (await req.json()) as { meetingId?: string; sessionId?: string };
    if (!meetingId || !sessionId) return NextResponse.json({ error: "meetingId + sessionId required" }, { status: 400 });

    const admin = supabaseAdmin();

    const endRes = await admin
      .from("meeting_minutes_sessions")
      .update({ ended_at: new Date().toISOString() })
      .eq("id", sessionId)
      .select("id,meeting_id,started_at,ended_at,pdf_path")
      .single();
    if (endRes.error) throw endRes.error;

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
      .select("id,code,title,description,position")
      .eq("meeting_id", meetingId)
      .order("position", { ascending: true });
    if (agendaRes.error) throw agendaRes.error;

    const notesRes = await admin.from("meeting_agenda_notes").select("agenda_item_id,notes").eq("session_id", sessionId);
    if (notesRes.error) throw notesRes.error;

    const prevRes = await admin
      .from("meeting_minutes_sessions")
      .select("id,started_at")
      .eq("meeting_id", meetingId)
      .lt("started_at", endRes.data.started_at)
      .order("started_at", { ascending: false })
      .limit(1);

    const prevSessionId = (prevRes.data ?? [])[0]?.id ?? null;
    let prevNotesByAgenda: Record<string, string> = {};
    if (prevSessionId) {
      const pn = await admin.from("meeting_agenda_notes").select("agenda_item_id,notes").eq("session_id", prevSessionId);
      if (!pn.error) {
        for (const row of pn.data ?? []) prevNotesByAgenda[String((row as any).agenda_item_id)] = String((row as any).notes ?? "");
      }
    }

    const notesByAgenda: Record<string, string> = {};
    for (const row of notesRes.data ?? []) notesByAgenda[String((row as any).agenda_item_id)] = String((row as any).notes ?? "");

    const tasksRes = await admin
      .from("meeting_tasks")
      .select("id,title,status,priority,owner_id,due_date,column_id")
      .eq("meeting_id", meetingId)
      .neq("status", "Completed")
      .order("updated_at", { ascending: false });

    const colsRes = await admin.from("meeting_task_columns").select("id,name").eq("meeting_id", meetingId);
    const profilesRes = await admin.from("profiles").select("id,full_name,email");

    const colNameById = new Map((colsRes.data ?? []).map((c: any) => [String(c.id), String(c.name)]));
    const ownerNameById = new Map(
      (profilesRes.data ?? []).map((p: any) => [String(p.id), String(p.full_name?.trim() || p.email?.trim() || "Unassigned")])
    );

    const agenda = (agendaRes.data ?? []).map((a: any) => {
      const id = String(a.id);
      return {
        code: a.code ? String(a.code) : null,
        title: String(a.title ?? ""),
        description: a.description ? String(a.description) : null,
        notes: String(notesByAgenda[id] ?? "").trim(),
        prevNotes: String(prevNotesByAgenda[id] ?? "").trim(),
      };
    });

    const tasks = ((tasksRes.data ?? []) as any[]).map((t) => ({
      title: String(t.title ?? ""),
      column: colNameById.get(String(t.column_id)) ?? "",
      status: String(t.status ?? ""),
      priority: String(t.priority ?? ""),
      owner: t.owner_id ? ownerNameById.get(String(t.owner_id)) ?? "Unassigned" : "Unassigned",
      due: t.due_date ? String(t.due_date) : null,
    }));

    const pdfBytes = await makeMinutesPdf({ meeting: meetingRes.data, attendees, agenda, tasks });

    const pdfBucket = requireEnv("MINUTES_PDF_BUCKET");
    const pdfPath = `meetings/${meetingId}/sessions/${sessionId}/minutes.pdf`;

    const up = await admin.storage.from(pdfBucket).upload(pdfPath, pdfBytes, { contentType: "application/pdf", upsert: true });
    if (up.error) throw up.error;

    await admin.from("meeting_minutes_sessions").update({ pdf_path: pdfPath }).eq("id", sessionId);

    const signed = await admin.storage.from(pdfBucket).createSignedUrl(pdfPath, 60 * 60 * 24 * 30);
    const pdfUrl = signed.data?.signedUrl ?? null;

    if (attendees.length) {
      const transporter = nodemailer.createTransport({
        host: requireEnv("SMTP_HOST"),
        port: Number(requireEnv("SMTP_PORT")),
        secure: Number(requireEnv("SMTP_PORT")) === 465,
        auth: { user: requireEnv("SMTP_USER"), pass: requireEnv("SMTP_PASS") },
      });

      const fromEmail = requireEnv("SMTP_FROM");
      const baseUrl = process.env.APP_BASE_URL || new URL(req.url).origin;
      const meetingUrl = `${baseUrl}/meetings/${meetingId}`;
      const started = new Date(meetingRes.data.start_at);

      const html = `
        <div style="font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial; background:#f9fafb; padding:20px;">
          <div style="max-width:720px; margin:0 auto;">
            <div style="background:#111827; color:white; padding:16px 18px; border-radius:18px;">
              <div style="font-size:18px; font-weight:800;">Meeting Minutes (PDF)</div>
              <div style="opacity:.9; margin-top:4px; font-size:13px;">${escapeHtml(meetingRes.data.title)} • ${started.toLocaleString()}</div>
              <div style="opacity:.9; margin-top:6px; font-size:13px;">Meeting page: <a href="${meetingUrl}" style="color:white; text-decoration:underline;">${meetingUrl}</a></div>
              ${pdfUrl ? `<div style="opacity:.9; margin-top:6px; font-size:13px;">PDF link: <a href="${pdfUrl}" style="color:white; text-decoration:underline;">Open PDF</a></div>` : ""}
            </div>
            <div style="margin-top:12px; color:#6b7280; font-size:12px;">The PDF is also attached to this email.</div>
          </div>
        </div>
      `;

      await transporter.sendMail({
        from: fromEmail,
        to: attendees.join(","),
        subject: `Minutes PDF: ${meetingRes.data.title} (${started.toLocaleDateString()})`,
        html,
        text: `Minutes PDF: ${meetingRes.data.title}\nMeeting page: ${meetingUrl}${pdfUrl ? `\nPDF: ${pdfUrl}` : ""}`,
        attachments: [
          { filename: `Minutes - ${meetingRes.data.title}.pdf`, content: Buffer.from(pdfBytes), contentType: "application/pdf" },
        ],
      });

      try {
        await admin.from("meeting_email_settings").upsert({ meeting_id: meetingId, last_sent_at: new Date().toISOString() }, { onConflict: "meeting_id" });
      } catch {
        // no-op
      }
    }

    return NextResponse.json({ ok: true, pdfUrl });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Conclude failed" }, { status: 500 });
  }
}
