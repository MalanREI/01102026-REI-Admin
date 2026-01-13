import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/src/lib/supabase/admin";

/**
 * Conclude Meeting (FAST)
 *
 * IMPORTANT:
 * - Do NOT run transcription / summarization here.
 * - We only finalize the session and queue AI processing.
 * - AI + PDF generation runs in a Supabase Edge Function triggered by a DB webhook.
 */

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      meetingId?: string;
      sessionId?: string;
      recordingPath?: string | null;
      referenceLink?: string | null;
    };

    const meetingId = String(body.meetingId ?? "").trim();
    const sessionId = String(body.sessionId ?? "").trim();
    const referenceLink = body.referenceLink ?? null;

    if (!meetingId || !sessionId) {
      return NextResponse.json({ error: "meetingId + sessionId required" }, { status: 400 });
    }

    const admin = supabaseAdmin();

    // If recordingPath not provided, try to locate the latest recording for this session.
    let recordingPath = String(body.recordingPath ?? "").trim();
    if (!recordingPath) {
      const rec = await admin
        .from("meeting_recordings")
        .select("storage_path,created_at")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!rec.error && rec.data?.storage_path) {
        recordingPath = String(rec.data.storage_path);
      }
    }

    // Mark the session as ended and queue AI processing.
    // NOTE: These columns are added in the Supabase migration steps:
    // - ai_status, ai_error, ai_processed_at, reference_link
    const upd = await admin
      .from("meeting_minutes_sessions")
      .update(
        {
          ended_at: new Date().toISOString(),
          reference_link: referenceLink,
          ai_status: recordingPath ? "queued" : "skipped",
          ai_error: null,
          ai_processed_at: null,
        } as any
      )
      .eq("id", sessionId)
      .select("id,ended_at,ai_status");

    if (upd.error) throw upd.error;

    // We return immediately. The Edge Function will:
    // - transcribe audio
    // - map notes to agenda items
    // - generate PDF
    // - update pdf_path
    // - email attendees
    return NextResponse.json({ ok: true, queued: true, ai_status: (upd.data as any)?.[0]?.ai_status ?? null });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Conclude failed" }, { status: 500 });
  }
}
