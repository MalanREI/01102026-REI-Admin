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
      referenceLink?: string | null;
    };

    const meetingId = String(body.meetingId ?? "").trim();
    const sessionId = String(body.sessionId ?? "").trim();
    const referenceLink = body.referenceLink ?? null;

    if (!meetingId || !sessionId) {
      return NextResponse.json({ error: "meetingId + sessionId required" }, { status: 400 });
    }

    const admin = supabaseAdmin();

    // Check if recording exists for this session
    const rec = await admin
      .from("meeting_recordings")
      .select("storage_path")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const hasRecording = !rec.error && !!rec.data?.storage_path;

    // Mark the session as ended and set status based on recording availability
    const upd = await admin
      .from("meeting_minutes_sessions")
      .update(
        {
          ended_at: new Date().toISOString(),
          reference_link: referenceLink,
          ai_status: hasRecording ? "ready" : "skipped",
          ai_error: null,
          ai_processed_at: null,
        } as any
      )
      .eq("id", sessionId)
      .select("id,ended_at,ai_status");

    if (upd.error) throw upd.error;

    return NextResponse.json({ 
      ok: true, 
      hasRecording,
      ai_status: (upd.data as any)?.[0]?.ai_status ?? null 
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Conclude failed" }, { status: 500 });
  }
}
