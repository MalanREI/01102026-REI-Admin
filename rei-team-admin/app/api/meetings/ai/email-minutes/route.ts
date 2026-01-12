
import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
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

export async function POST(req: Request) {
  try {
    const { meetingId, sessionId } = (await req.json()) as { meetingId?: string; sessionId?: string };
    if (!meetingId || !sessionId) return NextResponse.json({ error: "meetingId + sessionId required" }, { status: 400 });

    const admin = supabaseAdmin();

    const meetingRes = await admin
      .from("meetings")
      .select("id,title,location,start_at,duration_minutes")
      .eq("id", meetingId)
      .single();
    if (meetingRes.error) throw meetingRes.error;

    const attendeesRes = await admin.from("meeting_attendees").select("email").eq("meeting_id", meetingId);
    if (attendeesRes.error) throw attendeesRes.error;
    const attendees = (attendeesRes.data ?? []).map((x: any) => String(x.email).trim()).filter(Boolean);
    if (!attendees.length) return NextResponse.json({ ok: true, skipped: "no attendees" });

    const agendaRes = await admin
      .from("meeting_agenda_items")
      .select("id,code,title,description,position")
      .eq("meeting_id", meetingId)
      .order("position", { ascending: true });
    if (agendaRes.error) throw agendaRes.error;

    const notesRes = await admin.from("meeting_agenda_notes").select("agenda_item_id,notes").eq("session_id", sessionId);
    if (notesRes.error) throw notesRes.error;

    const notesByAgenda: Record<string, string> = {};
    for (const row of notesRes.data ?? []) notesByAgenda[(row as any).agenda_item_id] = (row as any).notes ?? "";

    const baseUrl = process.env.APP_BASE_URL || new URL(req.url).origin;
    const meetingUrl = `${baseUrl}/meetings/${meetingId}`;

    const started = new Date(meetingRes.data.start_at);

    const rowsHtml = (agendaRes.data ?? [])
      .map((a: any) => {
        const code = a.code ? `<span style="color:#6b7280; font-size:12px;">${escapeHtml(a.code)}&nbsp;&nbsp;</span>` : "";
        const desc = a.description
          ? `<div style="color:#6b7280; font-size:12px; margin-top:4px;">${escapeHtml(a.description)}</div>`
          : "";
        const notes = (notesByAgenda[a.id] ?? "").trim();
        const body = notes ? escapeHtml(notes).replace(/\n/g, "<br/>") : `<span style="color:#9ca3af">(No notes)</span>`;
        return `
        <div style="border:1px solid #e5e7eb; border-radius:16px; padding:12px 14px; margin-bottom:10px; background:#fff;">
          <div style="font-weight:700; font-size:14px;">${code}${escapeHtml(a.title)}</div>
          ${desc}
          <div style="margin-top:10px; font-size:13px; line-height:1.5; white-space:normal;">${body}</div>
        </div>
      `;
      })
      .join("");

    const html = `
      <div style="font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial; background:#f9fafb; padding:20px;">
        <div style="max-width:720px; margin:0 auto;">
          <div style="background:#111827; color:white; padding:16px 18px; border-radius:18px;">
            <div style="font-size:18px; font-weight:800;">Meeting Minutes</div>
            <div style="opacity:.9; margin-top:4px; font-size:13px;">
              ${escapeHtml(meetingRes.data.title)} • ${started.toLocaleString()}
            </div>
            <div style="opacity:.9; margin-top:6px; font-size:13px;">
              View in app: <a href="${meetingUrl}" style="color:white; text-decoration:underline;">${meetingUrl}</a>
            </div>
          </div>

          <div style="margin-top:14px;">
            ${rowsHtml}
          </div>

          <div style="color:#6b7280; font-size:12px; margin-top:14px;">
            Sent by REI Admin Panel.
          </div>
        </div>
      </div>
    `;

    const transporter = nodemailer.createTransport({
      host: requireEnv("SMTP_HOST"),
      port: Number(requireEnv("SMTP_PORT")),
      secure: Number(requireEnv("SMTP_PORT")) === 465,
      auth: { user: requireEnv("SMTP_USER"), pass: requireEnv("SMTP_PASS") },
    });

    const fromEmail = requireEnv("SMTP_FROM");

    await transporter.sendMail({
      from: fromEmail,
      to: attendees.join(","),
      subject: `Minutes: ${meetingRes.data.title} (${started.toLocaleDateString()})`,
      html,
      text: `Meeting minutes: ${meetingRes.data.title}\nOpen: ${meetingUrl}`,
    });

    await admin
      .from("meeting_email_settings")
      .upsert({ meeting_id: meetingId, last_sent_at: new Date().toISOString() }, { onConflict: "meeting_id" })
      .catch(() => null as any);

    return NextResponse.json({ ok: true, sent: attendees.length });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Failed to email minutes" }, { status: 500 });
  }
}
