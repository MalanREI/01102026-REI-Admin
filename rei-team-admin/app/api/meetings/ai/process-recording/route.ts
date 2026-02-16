import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/src/lib/supabase/admin";

/**
 * Process Recording Endpoint
 * Triggers AI processing for a session with a recording
 */

export async function POST(req: Request) {
  try {
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

    // Verify recording exists for this session
    const rec = await admin
      .from("meeting_recordings")
      .select("storage_path")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (rec.error || !rec.data?.storage_path) {
      return NextResponse.json({ error: "No recording found for this session" }, { status: 404 });
    }

    const recordingPath = rec.data.storage_path;

    // Update session to queued status
    const upd = await admin
      .from("meeting_minutes_sessions")
      .update({
        ai_status: "queued",
        ai_error: null,
      } as any)
      .eq("id", sessionId);

    if (upd.error) throw upd.error;

    // Call AI route asynchronously (don't await)
    const aiUrl = `${process.env.NEXT_PUBLIC_SITE_URL || ""}/api/meetings/ai`;
    fetch(aiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ meetingId, sessionId, recordingPath }),
    }).catch((err) => {
      console.error("Failed to trigger AI processing:", err);
    });

    return NextResponse.json({ ok: true, queued: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Failed to queue processing" }, { status: 500 });
  }
}
