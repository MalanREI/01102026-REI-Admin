import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { supabaseAdmin } from "@/src/lib/supabase/admin";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

/**
 * Manual email send for meeting minutes PDF.
 * Expects: { meetingId, sessionId, sentById }
 * - session must have pdf_path
 * - sends to meeting_attendees.email list
 * - marks meeting_minutes_sessions.email_status = sent (or error)
 */
export async function POST(req: Request) {
  let sessionId = "";
  try {
    const body = (await req.json()) as {
      meetingId?: string;
      sessionId?: string;
      sentById?: string | null;
    };

    const meetingId = String(body.meetingId || "").trim();
    sessionId = String(body.sessionId || "").trim();
    const sentById = String(body.sentById || "").trim() || null;

    if (!meetingId) return NextResponse.json({ error: "meetingId required" }, { status: 400 });
    if (!sessionId) return NextResponse.json({ error: "sessionId required" }, { status: 400 });

    const admin = supabaseAdmin();
    const pdfBucket = requireEnv("MINUTES_PDF_BUCKET");

    // Meeting
    const meetingRes = await admin.from("meetings").select("id,title,start_at").eq("id", meetingId).single();
    if (meetingRes.error) throw meetingRes.error;

    // Session (must have a PDF)
    const sessRes = await admin
      .from("meeting_minutes_sessions")
      .select("id,pdf_path,reference_link,ai_status,email_status")
      .eq("id", sessionId)
      .eq("meeting_id", meetingId)
      .single();
    if (sessRes.error) throw sessRes.error;

    const pdfPath = sessRes.data?.pdf_path as string | null;
    if (!pdfPath) return NextResponse.json({ error: "No PDF saved for this session" }, { status: 404 });

    // Attendees
    const attRes = await admin.from("meeting_attendees").select("email").eq("meeting_id", meetingId);
    if (attRes.error) throw attRes.error;

    const attendeeEmail = (attRes.data ?? [])
      .map((a: { email?: string }) => String(a.email || "").trim())
      .filter((x: string) => !!x);

    if (attendeeEmail.length === 0) {
      return NextResponse.json({ error: "No attendee emails found for this meeting" }, { status: 400 });
    }

    // Download PDF from storage
    const dl = await admin.storage.from(pdfBucket).download(pdfPath);
    if (dl.error) throw dl.error;
    const ab = await dl.data.arrayBuffer();
    const pdfBytes = Buffer.from(ab);

    // Signed URL (optional for email body)
    let pdfUrl: string | null = null;
    try {
      const signed = await admin.storage.from(pdfBucket).createSignedUrl(pdfPath, 60 * 60 * 24 * 30);
      if (!signed.error) pdfUrl = signed.data?.signedUrl ?? null;
    } catch {
      // ignore
    }

    // Send
    const transporter = nodemailer.createTransport({
      host: requireEnv("SMTP_HOST"),
      port: Number(requireEnv("SMTP_PORT")),
      secure: Number(requireEnv("SMTP_PORT")) === 465,
      auth: { user: requireEnv("SMTP_USER"), pass: requireEnv("SMTP_PASS") },
    });

    const meeting = meetingRes.data;
    const start = new Date(meeting.start_at);
    const subject = `Minutes PDF: ${meeting.title} (${start.toLocaleDateString()})`;

    const referenceLink = sessRes.data?.reference_link ?? null;
    const bodyText =
      "Meeting minutes PDF attached.\n\n" +
      (referenceLink ? `Reference link: ${referenceLink}\n\n` : "") +
      (pdfUrl ? `PDF link (signed): ${pdfUrl}\n\n` : "");

    await transporter.sendMail({
      from: requireEnv("SMTP_FROM"),
      to: attendeeEmail.join(","),
      subject,
      text: bodyText,
      attachments: [
        {
          filename: `Minutes - ${meeting.title}.pdf`,
          content: pdfBytes,
          contentType: "application/pdf",
        },
      ],
    });

    // Record send state
    await admin
      .from("meeting_minutes_sessions")
      .update({
        email_status: "sent",
        email_sent_at: new Date().toISOString(),
        email_sent_by: sentById,
        email_error: null,
      })
      .eq("id", sessionId);

    return NextResponse.json({ ok: true, to: attendeeEmail, pdfPath, pdfUrl });
  } catch (e: unknown) {
    // Best-effort error recording
    try {
      if (sessionId) {
        const admin = supabaseAdmin();
        await admin
          .from("meeting_minutes_sessions")
          .update({ email_status: "error", email_error: (e as Error)?.message ?? "Send failed" })
          .eq("id", sessionId);
      }
    } catch {
      // ignore
    }
    return NextResponse.json({ error: (e as Error)?.message ?? "Send failed" }, { status: 500 });
  }
}

