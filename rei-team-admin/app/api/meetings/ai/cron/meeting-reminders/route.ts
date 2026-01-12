
import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { supabaseAdmin } from "@/src/lib/supabase/admin";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

function shouldSend(frequency: string, lastSentAt: string | null): boolean {
  if (!frequency || frequency === "none") return false;
  if (!lastSentAt) return true;

  const last = new Date(lastSentAt);
  const now = new Date();
  const diffMs = now.getTime() - last.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  if (frequency === "daily") return diffDays >= 1;

  if (frequency === "weekdays") {
    const weekday = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", weekday: "short" })
      .format(now)
      .toLowerCase();
    const isWeekend = weekday.startsWith("sat") || weekday.startsWith("sun");
    if (isWeekend) return false;
    return diffDays >= 1;
  }

  if (frequency === "weekly") return diffDays >= 7;
  if (frequency === "biweekly") return diffDays >= 14;

  if (frequency === "monthly") {
    const lastLa = new Date(last.toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
    const nowLa = new Date(now.toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
    const newMonth = nowLa.getFullYear() !== lastLa.getFullYear() || nowLa.getMonth() !== lastLa.getMonth();
    return newMonth && diffDays >= 28;
  }

  return false;
}

export async function GET(req: Request) {
  try {
    // Vercel Cron sets `x-vercel-cron: 1`.
    // Optional: also allow ?secret= if you want an extra shared secret.
    const isVercelCron = req.headers.get("x-vercel-cron") === "1";
    const secret = process.env.CRON_SECRET;
    const got = new URL(req.url).searchParams.get("secret");
    if (!isVercelCron && secret && got !== secret) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

        // Guard: only send at 9:00am America/Los_Angeles
    const now = new Date();
    const laHour = Number(
      new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Los_Angeles",
        hour: "2-digit",
        hour12: false,
      }).format(now)
    );

    if (laHour !== 9) {
      return NextResponse.json({ ok: true, skipped: "Not 9am America/Los_Angeles" });
    }

    const admin = supabaseAdmin();

    const settings = await admin
      .from("meeting_email_settings")
      .select("meeting_id,reminder_frequency,last_sent_at")
      .neq("reminder_frequency", "none");
    if (settings.error) throw settings.error;

    const meetingIds = (settings.data ?? []).map((x: any) => x.meeting_id);
    if (!meetingIds.length) return NextResponse.json({ ok: true, sent: 0 });

    const meetingsRes = await admin
      .from("meetings")
      .select("id,title,start_at")
      .in("id", meetingIds);
    if (meetingsRes.error) throw meetingsRes.error;

    const byId = new Map((meetingsRes.data ?? []).map((m: any) => [m.id, m]));

    const transporter = nodemailer.createTransport({
      host: requireEnv("SMTP_HOST"),
      port: Number(requireEnv("SMTP_PORT")),
      secure: Number(requireEnv("SMTP_PORT")) === 465,
      auth: { user: requireEnv("SMTP_USER"), pass: requireEnv("SMTP_PASS") },
    });
    const fromEmail = requireEnv("SMTP_FROM");
    const baseUrl = process.env.APP_BASE_URL || new URL(req.url).origin;

    let sent = 0;

    for (const row of settings.data ?? []) {
      const meeting = byId.get((row as any).meeting_id);
      if (!meeting) continue;

      const freq = String((row as any).reminder_frequency || "none");
      const lastSentAt = (row as any).last_sent_at as string | null;
      if (!shouldSend(freq, lastSentAt)) continue;

      const attendeesRes = await admin.from("meeting_attendees").select("email").eq("meeting_id", meeting.id);
      if (attendeesRes.error) continue;
      const attendees = (attendeesRes.data ?? []).map((x: any) => String(x.email).trim()).filter(Boolean);
      if (!attendees.length) continue;

      const url = `${baseUrl}/meetings/${meeting.id}`;

      await transporter.sendMail({
        from: fromEmail,
        to: attendees.join(","),
        subject: `Reminder: ${meeting.title}`,
        text: `Reminder to review tasks + agenda for ${meeting.title}.\nOpen: ${url}`,
        html: `<p>Reminder to review tasks + agenda for <b>${meeting.title}</b>.</p><p><a href="${url}">${url}</a></p>`,
      });

      await admin
        .from("meeting_email_settings")
        .update({ last_sent_at: new Date().toISOString() })
        .eq("meeting_id", meeting.id);

      sent += attendees.length;
    }

    return NextResponse.json({ ok: true, sent });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "cron failed" }, { status: 500 });
  }
}
