import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { supabaseAdmin } from "@/src/lib/supabase/admin";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

function escapeIcsText(s: string) {
  return String(s)
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function buildIcs(opts: {
  uid: string;
  start: Date;
  end: Date;
  summary: string;
  description?: string;
  location?: string | null;
  organizerEmail: string;
  attendees: string[];
  url?: string;
}) {
  const dt = (d: Date) =>
    d
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}Z$/, "Z");

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//REI Admin//Meetings//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${opts.uid}`,
    `DTSTAMP:${dt(new Date())}`,
    `DTSTART:${dt(opts.start)}`,
    `DTEND:${dt(opts.end)}`,
    `SUMMARY:${escapeIcsText(opts.summary)}`,
    opts.location ? `LOCATION:${escapeIcsText(opts.location)}` : "",
    opts.url ? `URL:${escapeIcsText(opts.url)}` : "",
    opts.description ? `DESCRIPTION:${escapeIcsText(opts.description)}` : "",
    `ORGANIZER:MAILTO:${opts.organizerEmail}`,
    ...opts.attendees.map((a) => `ATTENDEE;ROLE=REQ-PARTICIPANT;RSVP=TRUE:MAILTO:${a}`),
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean);

  return lines.join("\r\n");
}

export async function POST(req: Request) {
  try {
    const { meetingId } = (await req.json()) as { meetingId?: string };
    if (!meetingId) return NextResponse.json({ error: "meetingId required" }, { status: 400 });

    const admin = supabaseAdmin();

    const m = await admin
      .from("meetings")
      .select("id,title,location,start_at,duration_minutes")
      .eq("id", meetingId)
      .single();
    if (m.error) throw m.error;

    const a = await admin.from("meeting_attendees").select("email").eq("meeting_id", meetingId);
    if (a.error) throw a.error;

    const attendees = (a.data ?? []).map((x: any) => String(x.email).trim()).filter(Boolean);
    if (!attendees.length) return NextResponse.json({ ok: true, skipped: "no attendees" });

    const smtpHost = requireEnv("SMTP_HOST");
    const smtpPort = Number(requireEnv("SMTP_PORT"));
    const smtpUser = requireEnv("SMTP_USER");
    const smtpPass = requireEnv("SMTP_PASS");
    const fromEmail = requireEnv("SMTP_FROM");
    const baseUrl = process.env.APP_BASE_URL || new URL(req.url).origin;

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: { user: smtpUser, pass: smtpPass },
    });

    const start = new Date(m.data.start_at);
    const end = new Date(start.getTime() + Number(m.data.duration_minutes || 60) * 60_000);

    const url = `${baseUrl}/meetings/${meetingId}`;
    const uid = `rei-meeting-${meetingId}@renewableenergyincentives.com`;
    const ics = buildIcs({
      uid,
      start,
      end,
      summary: m.data.title,
      description: `REI meeting. Open the meeting page for agenda, tasks, and minutes: ${url}`,
      location: m.data.location,
      organizerEmail: fromEmail,
      attendees,
      url,
    });

    await transporter.sendMail({
      from: fromEmail,
      to: attendees.join(","),
      subject: `Invite: ${m.data.title}`,
      text: `You have been invited to: ${m.data.title}\nWhen: ${start.toLocaleString()}\nWhere: ${
        m.data.location ?? "(not set)"
      }\nLink: ${url}`,
      icalEvent: {
        method: "REQUEST",
        content: ics,
      },
    });
export { POST } from "@/app/api/meetings/ai/invite/route";
    return NextResponse.json({ ok: true, invited: attendees.length });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Invite failed" }, { status: 500 });
  }
}

